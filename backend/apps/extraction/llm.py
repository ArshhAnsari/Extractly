"""
LLM abstraction layer for CV data extraction.

Primary provider: Groq (Llama 3.3 70B Versatile, official `groq` SDK,
JSON mode). OpenAI and Gemini extractors are kept below, commented out,
for anyone with those keys who wants to switch back or build a
fallback chain later.

Constructs a dynamic Pydantic schema based on the job's fields_snapshot
and validates the LLM outputs directly against it.
"""

import json
import logging
import time

from django.conf import settings
import pydantic
from groq import Groq, APIConnectionError, RateLimitError, APIStatusError

logger = logging.getLogger(__name__)


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

    return pydantic.create_model("CVExtraction", **fields)


def build_prompt(fields_snapshot: list) -> str:
    """Constructs the extraction prompt instruction."""
    lines = [
        "Extract the following information from the provided CV text.",
        "Return ONLY a valid JSON object matching the requested fields.",
        "If a field is not found in the CV, its value MUST be null.",
        "Do not include markdown blocks like ```json.",
        "",
        "Fields to extract:",
    ]

    for f in fields_snapshot:
        hint = f.get("hint")
        hint_text = f" - Hint: {hint}" if hint else ""
        lines.append(f"- {f['key']} (Type: {f['type']}){hint_text}")

    return "\n".join(lines)


def extract(raw_text: str, fields_snapshot: list) -> dict:
    """Route extraction to the configured LLM provider."""
    provider = settings.LLM_PROVIDER
    prompt = build_prompt(fields_snapshot)

    logger.info(
        "LLM extraction starting | provider=%s | cv_chars=%d | fields=%d",
        provider,
        len(raw_text),
        len(fields_snapshot),
    )

    if provider == "groq":
        return groq_extract(raw_text, prompt)

    # if provider == "openai":
    #     return openai_extract(raw_text, prompt)
    #
    # if provider == "gemini":
    #     return gemini_extract(raw_text, prompt)

    raise ValueError(
        f"Unsupported or unconfigured LLM_PROVIDER: {provider!r}. "
        "Uncomment the matching branch and extractor function below to enable it."
    )


def groq_extract(raw_text: str, prompt: str) -> dict:
    """Extract using Groq (model from settings.GROQ_MODEL, JSON mode)."""
    if not settings.GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY is missing from environment variables.")

    client = Groq(api_key=settings.GROQ_API_KEY)

    start = time.perf_counter()
    try:
        response = client.chat.completions.create(
            model=settings.GROQ_MODEL,
            temperature=0,
            response_format={"type": "json_object"},
            timeout=60,
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": f"CV Text:\n\n{raw_text}"},
            ],
        )
    except RateLimitError as e:
        logger.warning("Groq rate limit hit (model=%s): %s", settings.GROQ_MODEL, e)
        raise
    except APIConnectionError as e:
        logger.warning("Groq connection error: %s", e)
        raise
    except APIStatusError as e:
        logger.error("Groq API error %s: %s", e.status_code, e.message)
        raise

    elapsed = time.perf_counter() - start
    logger.info("Groq extraction completed in %.2fs (model=%s)", elapsed, settings.GROQ_MODEL)

    content = response.choices[0].message.content
    return json.loads(content if content else "{}")


# ─────────────────────────────────────────────────────────────
# OPENAI (commented out, not active)
# Uncomment this function + the "openai" branch in extract()
# if you have OPENAI_API_KEY and want it as primary or fallback.
# ─────────────────────────────────────────────────────────────
# def openai_extract(raw_text: str, prompt: str) -> dict:
#     """Extract using OpenAI GPT-4o Mini."""
#     from openai import OpenAI
#
#     client = OpenAI(api_key=settings.OPENAI_API_KEY)
#
#     start = time.perf_counter()
#     response = client.chat.completions.create(
#         model="gpt-4o-mini",
#         timeout=60,
#         response_format={"type": "json_object"},
#         messages=[
#             {"role": "system", "content": prompt},
#             {"role": "user", "content": f"CV Text:\n\n{raw_text}"},
#         ],
#     )
#     elapsed = time.perf_counter() - start
#     logger.info("OpenAI extraction completed in %.2fs", elapsed)
#
#     content = response.choices[0].message.content
#     return json.loads(content if content else "{}")


# ─────────────────────────────────────────────────────────────
# GEMINI (commented out, not active)
# Uncomment this function + the "gemini" branch in extract()
# if Gemini billing gets enabled and quota stops being the issue.
# ─────────────────────────────────────────────────────────────
# def gemini_extract(raw_text: str, prompt: str) -> dict:
#     """Extract using Google Gemini (model from settings.GEMINI_MODEL)."""
#     import google.generativeai as genai
#
#     genai.configure(api_key=settings.GEMINI_API_KEY)  # type: ignore
#
#     model = genai.GenerativeModel(  # type: ignore
#         settings.GEMINI_MODEL,
#         system_instruction=prompt,
#     )
#
#     start = time.perf_counter()
#     response = model.generate_content(
#         f"CV Text:\n\n{raw_text}",
#         generation_config=genai.GenerationConfig(  # type: ignore
#             response_mime_type="application/json"
#         ),
#         request_options={"timeout": 60},
#     )
#     elapsed = time.perf_counter() - start
#     logger.info("Gemini extraction completed in %.2fs", elapsed)
#
#     return json.loads(response.text)