import os
import fitz  # PyMuPDF
import base64
import json
from openai import OpenAI

class AITOCExtractor:
    def __init__(self, api_key, base_url, model="gpt-4o"):
        self.client = OpenAI(api_key=api_key, base_url=base_url)
        self.model = model

    def pdf_to_base64_images(self, pdf_path, page_range=(0, 10)):
        """将指定范围的 PDF 页面转换为 base64 编码的图片"""
        images_base64 = []
        doc = fitz.open(pdf_path)
        
        start_page, end_page = page_range
        # 确保范围在文档内
        end_page = min(end_page, doc.page_count)
        
        for i in range(start_page, end_page):
            page = doc.load_page(i)
            # 提高分辨率以保证 OCR 质量 (2.0 zoom)
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
            img_data = pix.tobytes("png")
            img_base64 = base64.b64encode(img_data).decode('utf-8')
            images_base64.append(img_base64)
            
        doc.close()
        return images_base64

    def repair_json(self, json_str):
        """尝试修复被截断的 JSON 字符串"""
        json_str = json_str.strip()
        if not json_str:
            return None
        
        # 补全缺失的括号和引号
        stack = []
        in_string = False
        escaped = False
        
        fixed_str = ""
        for char in json_str:
            fixed_str += char
            if not escaped:
                if char == '"':
                    in_string = not in_string
                elif not in_string:
                    if char in '{[':
                        stack.append(char)
                    elif char in '}]':
                        if stack:
                            stack.pop()
            
            if char == '\\':
                escaped = not escaped
            else:
                escaped = False
        
        # 如果在字符串中结束，补双引号
        if in_string:
            fixed_str += '"'
            
        # 补齐堆栈中剩余的括号
        while stack:
            opener = stack.pop()
            fixed_str += '}' if opener == '{' else ']'
            
        try:
            return json.loads(fixed_str)
        except:
            return None

    def extract_toc(self, pdf_path, page_range=(0, 20)):
        """调用大模型进行目录提取，并自动识别页码偏移"""
        images = self.pdf_to_base64_images(pdf_path, page_range)
        
        # 增加页码元数据辅助 AI 计算偏移
        start_phys_page = page_range[0] + 1
        
        prompt = f"""
        你是一个专业的文档处理助手。我将为你提供 PDF 前若干页的图片。
        这些图片对应的物理页码从第 {start_phys_page} 页开始。
        
        任务：
        1. 识别并提取目录信息 (title, page, level)。
        2. 计算 page_offset (公式: offset = 物理页码 - 逻辑页码)。
        
        输出格式：
        {{
          "page_offset": 16,
          "toc": [
            {{"title": "第一章", "page": 1, "level": 0}},
            ...
          ]
        }}
        
        注意：
        - `level`: 0(大标题/章), 1(节), 2(小节)。
        - 仅返回 JSON。即使目录很长，也请尽力返回。
        """

        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                ]
            }
        ]
        
        for idx, img in enumerate(images):
            phys_num = start_phys_page + idx
            messages[0]["content"].append({
                "type": "text",
                "text": f"p{phys_num}"
            })
            messages[0]["content"].append({
                "type": "image_url",
                "image_url": { "url": f"data:image/png;base64,{img}" }
            })

        try:
            print(f"--- AI Request: Sending {len(images)} images to model {self.model} ---")
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                max_tokens=4096,
                response_format={"type": "json_object"}
            )
            
            content = response.choices[0].message.content
            print(f"--- AI Raw Response ---\n{content}\n--- End Raw Response ---")
            
            # 使用鲁棒的解析逻辑
            result = self.repair_json(content)
            if not result:
                print("Repair failed, original content was invalid.")
                return {"toc": [], "page_offset": None}
            
            # 提取 offset 和 toc
            page_offset = result.get('page_offset', None)
            toc_list = []
            
            if "toc" in result and isinstance(result["toc"], list):
                toc_list = result["toc"]
            elif isinstance(result, list):
                toc_list = result
            else:
                for key, value in result.items():
                    if isinstance(value, list) and key != "page_offset":
                        toc_list = value
                        break
            
            return {
                "toc": toc_list,
                "page_offset": page_offset
            }
                
        except Exception as e:
            print(f"AI Extraction Error: {str(e)}")
            raise e
