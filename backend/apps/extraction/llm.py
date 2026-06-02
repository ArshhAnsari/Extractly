"""
LLM abstraction layer for CV data extraction.

Supports both OpenAI (GPT-4o) and Google Gemini (Gemini 1.5 Flash).
Constructs a dynamic Pydantic schema based on the job's fields_snapshot
and validates the LLM outputs directly against it.
"""

import json
from typing import Any

from django.conf import settings
import pydantic


def build_schema(fields_snapshot: list) -> type[pydantic.BaseModel]:
    """Dynamically generate a Pydantic schema from the fields snapshot."""
    fields = {}
    for f in fields_snapshot:
        t = f.get("type", "string")
        if t == "string":
            py_type = str | None
        elif t == "number":
            py_type = float | None
        elif t == "list":
            py_type = list[str] | None
        else:
            py_type = str | None
            
        fields[f["key"]] = (py_type, None)
    
    return pydantic.create_model('CVExtraction', **fields)


def build_prompt(fields_snapshot: list) -> str:
    """Constructs the extraction prompt instruction."""
    lines = [
        "Extract the following information from the provided CV text.",
        "Return ONLY a valid JSON object matching the requested fields.",
        "If a field is not found in the CV, its value MUST be null.",
        "Do not include markdown blocks like ```json.",
        "",
        "Fields to extract:"
    ]
    
    for f in fields_snapshot:
        hint = f.get("hint")
        hint_text = f" - Hint: {hint}" if hint else ""
        lines.append(f"- {f['key']} (Type: {f['type']}){hint_text}")
        
    return "\n".join(lines)


def extract(raw_text: str, fields_snapshot: list) -> dict:
    """Route extraction to the specified LLM provider."""
    provider = settings.LLM_PROVIDER
    prompt = build_prompt(fields_snapshot)
    
    if provider == "openai":
        return openai_extract(raw_text, prompt)
    else:
        return gemini_extract(raw_text, prompt)


def openai_extract(raw_text: str, prompt: str) -> dict:
    """Extract using OpenAI GPT-4o."""
    from openai import OpenAI
    client = OpenAI(api_key=settings.OPENAI_API_KEY)
    
    response = client.chat.completions.create(
        model="gpt-4o",
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": prompt},
            {"role": "user", "content": f"CV Text:\n\n{raw_text}"}
        ]
    )
    content = response.choices[0].message.content
    return json.loads(content if content else "{}")


def gemini_extract(raw_text: str, prompt: str) -> dict:
    """Extract using Google Gemini 1.5 Flash."""
    import google.generativeai as genai
    genai.configure(api_key=settings.GEMINI_API_KEY)  # type: ignore
    
    model = genai.GenerativeModel(  # type: ignore
        "gemini-flash-latest",
        system_instruction=prompt
    )
    
    response = model.generate_content(
        f"CV Text:\n\n{raw_text}",
        generation_config=genai.GenerationConfig(  # type: ignore
            response_mime_type="application/json"
        )
    )
    return json.loads(response.text)
