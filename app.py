#!/usr/bin/env python3
"""
PDF目录编辑器 - Flask后端服务
"""
from flask import Flask, request, jsonify, send_file, render_template
from pypdf import PdfReader, PdfWriter
import os
import json
import re
from werkzeug.utils import secure_filename
import tempfile
from datetime import datetime, timedelta
import threading
import time
from ai_extractor import AITOCExtractor

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB max file size
app.config['UPLOAD_FOLDER'] = tempfile.gettempdir()

def cleanup_old_files():
    """后台任务：清理超过1小时的临时文件"""
    while True:
        try:
            now = datetime.now()
            upload_folder = app.config['UPLOAD_FOLDER']
            for filename in os.listdir(upload_folder):
                # 检查是否是我们生成的带时间戳的文件
                if re.match(r'^\d{8}_\d{6}_', filename) or filename.startswith('toc_'):
                    filepath = os.path.join(upload_folder, filename)
                    file_time = datetime.fromtimestamp(os.path.getmtime(filepath))
                    if now - file_time > timedelta(hours=1):
                        try:
                            os.remove(filepath)
                            print(f"Cleanup: Deleted old file {filename}")
                        except:
                            pass
        except Exception as e:
            print(f"Cleanup Error: {e}")
        
        # 每30分钟运行一次
        time.sleep(1800)

# 启动清理线程
cleanup_thread = threading.Thread(target=cleanup_old_files, daemon=True)
cleanup_thread.start()

ALLOWED_EXTENSIONS = {'pdf'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/')
def index():
    """主页"""
    return render_template('index.html')

@app.route('/api/upload', methods=['POST'])
def upload_pdf():
    """上传PDF文件"""
    if 'file' not in request.files:
        return jsonify({'error': '没有文件'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': '没有选择文件'}), 400
    
    if file and allowed_file(file.filename):
        raw_filename = file.filename
        filename = secure_filename(raw_filename)
        # If secure_filename stripped everything (e.g. for purely Chinese names)
        if not filename or filename.startswith('.'):
            filename = "document.pdf"
            
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        unique_filename = f"{timestamp}_{filename}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
        file.save(filepath)
        
        # 获取PDF信息
        try:
            reader = PdfReader(filepath)
            page_count = len(reader.pages)
            
            return jsonify({
                'success': True,
                'filename': unique_filename,
                'original_filename': raw_filename,
                'page_count': page_count
            })
        except Exception as e:
            os.remove(filepath)
            return jsonify({'error': f'PDF读取失败: {str(e)}'}), 400
    
    return jsonify({'error': '不支持的文件格式'}), 400

@app.route('/api/extract-toc', methods=['POST'])
def extract_toc():
    """提取PDF目录"""
    data = request.json
    filename = data.get('filename')
    
    if not filename:
        return jsonify({'error': '缺少文件名'}), 400
    
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    if not os.path.exists(filepath):
        return jsonify({'error': '文件不存在'}), 404
    
    try:
        reader = PdfReader(filepath)
        toc_entries = []
        
        # 提取前 50 页寻找目录（扩大范围以应对长目录）
        # 更加鲁棒的正则：支持 章节 或 小节 (如 1.1 或 1.1.1)
        # 匹配模式：[标题码] [标题内容] [斜杠或点号分隔] [页码]
        # 优化点：分隔符前后的空格设为可选，匹配更广泛
        pattern = re.compile(r'(第\d+章|\d+(?:\.\d+)+)\s+(.+?)\s*[/／\s]\s*(\d+)(?=\s*(?:第\d+章|\d+(?:\.\d+)+)|$)', re.UNICODE)
        
        for i in range(min(50, len(reader.pages))):
            page = reader.pages[i]
            text = page.extract_text()
            if not text:
                continue
                
            # 使用 finditer 处理一行中可能出现的多个条目
            for match in pattern.finditer(text):
                code, title, page_num = match.groups()
                
                # 确定层级
                if code.startswith('第'):
                    level = 0
                else:
                    level = min(2, code.count('.'))
                
                toc_entries.append({
                    'title': f"{code} {title.strip()}",
                    'page': int(page_num),
                    'level': level
                })
        
        return jsonify({
            'success': True,
            'toc': toc_entries
        })
    except Exception as e:
        return jsonify({'error': f'目录提取失败: {str(e)}'}), 500

@app.route('/api/extract-toc-ai', methods=['POST'])
def extract_toc_ai():
    """使用 AI 提取 PDF 目录"""
    data = request.json
    filename = data.get('filename')
    api_key = data.get('api_key')
    base_url = data.get('base_url')
    model = data.get('model', 'gpt-4o')
    page_start = data.get('page_start', 0)
    page_end = data.get('page_end', 10)
    
    if not all([filename, api_key, base_url]):
        return jsonify({'error': '缺少必要参数 (文件名, Key 或 BaseURL)'}), 400
    
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    if not os.path.exists(filepath):
        return jsonify({'error': '文件不存在'}), 404
        
    try:
        extractor = AITOCExtractor(api_key=api_key, base_url=base_url, model=model)
        # 页面范围转换（前端是 1-indexed，后端是 0-indexed）
        start_idx = max(0, page_start - 1)
        end_idx = page_end
        
        result = extractor.extract_toc(filepath, page_range=(start_idx, end_idx))
        
        return jsonify({
            'success': True,
            'toc': result.get('toc', []),
            'page_offset': result.get('page_offset')
        })
    except Exception as e:
        return jsonify({'error': f'AI 提取失败: {str(e)}'}), 500

@app.route('/api/add-toc', methods=['POST'])
def add_toc():
    """添加目录到PDF"""
    data = request.json
    filename = data.get('filename')
    toc = data.get('toc', [])
    page_offset = data.get('page_offset', 0)
    
    if not filename or not toc:
        return jsonify({'error': '缺少必要参数'}), 400
    
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    if not os.path.exists(filepath):
        return jsonify({'error': '文件不存在'}), 404
    
    try:
        reader = PdfReader(filepath)
        writer = PdfWriter()
        
        # 复制所有页面
        for page in reader.pages:
            writer.add_page(page)
        
        # 添加书签
        parent_bookmarks = [None, None, None]
        
        for entry in toc:
            title = entry['title']
            page_num = entry['page'] + page_offset
            level = entry.get('level', 0)
            
            # pypdf页码从0开始
            page_index = page_num - 1
            
            if level == 0:
                bookmark = writer.add_outline_item(title, page_index)
                parent_bookmarks[0] = bookmark
                parent_bookmarks[1] = None
                parent_bookmarks[2] = None
            elif level == 1:
                bookmark = writer.add_outline_item(title, page_index, parent=parent_bookmarks[0])
                parent_bookmarks[1] = bookmark
                parent_bookmarks[2] = None
            elif level == 2:
                writer.add_outline_item(title, page_index, parent=parent_bookmarks[1])
        
        # 保存新PDF
        output_filename = f"toc_{filename}"
        output_filepath = os.path.join(app.config['UPLOAD_FOLDER'], output_filename)
        
        with open(output_filepath, 'wb') as output_file:
            writer.write(output_file)
        
        return jsonify({
            'success': True,
            'output_filename': output_filename,
            'bookmark_count': len(toc)
        })
    except Exception as e:
        return jsonify({'error': f'目录添加失败: {str(e)}'}), 500

@app.route('/api/download/<filename>')
def download_file(filename):
    """下载文件"""
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    if not os.path.exists(filepath):
        return jsonify({'error': '文件不存在'}), 404
    
    # 优先使用前端传来的文件名
    display_name = request.args.get('name', filename)
    
    return send_file(filepath, as_attachment=True, download_name=display_name)

if __name__ == '__main__':
    app.run(debug=True, port=5001)
