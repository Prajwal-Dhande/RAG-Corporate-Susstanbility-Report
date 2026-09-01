"""
Sustainability MMKG-RAG: Model Provider Abstraction

Wraps LLM/VLM calls behind a provider interface to prevent vendor lock-in.
Supports: OpenAI (GPT-4o-mini), Mock (testing), Local VLM (future).
"""

from __future__ import annotations

import base64
import json
import logging
import time
from abc import ABC, abstractmethod
from typing import Any, Optional

from backend.app.config import get_settings

logger = logging.getLogger(__name__)


class ModelResponse:
    """Standardized model response."""

    def __init__(
        self,
        content: str,
        parsed: Optional[dict | list] = None,
        model: str = "",
        tokens_input: int = 0,
        tokens_output: int = 0,
        duration_seconds: float = 0.0,
        raw_response: Any = None,
    ):
        self.content = content
        self.parsed = parsed
        self.model = model
        self.tokens_input = tokens_input
        self.tokens_output = tokens_output
        self.duration_seconds = duration_seconds
        self.raw_response = raw_response


class ModelProvider(ABC):
    """Abstract model provider interface."""

    @abstractmethod
    async def generate(
        self,
        prompt: str,
        images: Optional[list[bytes]] = None,
        system_prompt: Optional[str] = None,
        temperature: float = 0.0,
        max_tokens: int = 4096,
        json_mode: bool = False,
    ) -> ModelResponse:
        """Generate a response from the model."""
        ...

    @abstractmethod
    def get_name(self) -> str:
        """Return the provider/model name."""
        ...


class OpenAIProvider(ModelProvider):
    """OpenAI GPT-4o-mini provider for multimodal extraction."""

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        settings = get_settings()
        self.api_key = api_key or settings.openai_api_key
        self.model = model or settings.vlm_model

        if not self.api_key:
            raise ValueError("OPENAI_API_KEY is required for OpenAI provider")

        from openai import AsyncOpenAI
        self.client = AsyncOpenAI(api_key=self.api_key)

    async def generate(
        self,
        prompt: str,
        images: Optional[list[bytes]] = None,
        system_prompt: Optional[str] = None,
        temperature: float = 0.0,
        max_tokens: int = 4096,
        json_mode: bool = False,
    ) -> ModelResponse:
        messages = []

        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})

        # Build user message content
        content = []

        if images:
            for img_data in images:
                b64 = base64.b64encode(img_data).decode("utf-8")
                content.append({
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/png;base64,{b64}",
                        "detail": "high",
                    },
                })

        content.append({"type": "text", "text": prompt})
        messages.append({"role": "user", "content": content})

        kwargs = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}

        start = time.time()
        try:
            response = await self.client.chat.completions.create(**kwargs)
            duration = time.time() - start

            content_text = response.choices[0].message.content or ""
            usage = response.usage

            parsed = None
            if json_mode:
                try:
                    parsed = json.loads(content_text)
                except json.JSONDecodeError:
                    logger.warning("Failed to parse JSON response from model")

            return ModelResponse(
                content=content_text,
                parsed=parsed,
                model=self.model,
                tokens_input=usage.prompt_tokens if usage else 0,
                tokens_output=usage.completion_tokens if usage else 0,
                duration_seconds=duration,
                raw_response=response,
            )
        except Exception as e:
            duration = time.time() - start
            logger.error(f"OpenAI API call failed after {duration:.2f}s: {e}")
            raise

    def get_name(self) -> str:
        return f"openai/{self.model}"


class MockProvider(ModelProvider):
    """Mock provider for testing without API calls."""

    def __init__(self):
        self.call_count = 0

    async def generate(
        self,
        prompt: str,
        images: Optional[list[bytes]] = None,
        system_prompt: Optional[str] = None,
        temperature: float = 0.0,
        max_tokens: int = 4096,
        json_mode: bool = False,
    ) -> ModelResponse:
        self.call_count += 1

        # Return a sample extraction result
        mock_result = {
            "entities": [
                {
                    "name": "Total GHG Emissions",
                    "type": "KPI",
                    "modality": "text",
                    "description": "Total greenhouse gas emissions across all scopes",
                    "source_component_ids": ["P1"],
                    "confidence": 0.85,
                },
                {
                    "name": "Scope 1",
                    "type": "EmissionScope",
                    "modality": "text",
                    "description": "Direct emissions from owned or controlled sources",
                    "source_component_ids": ["P1"],
                    "confidence": 0.90,
                },
            ],
            "relations": [
                {
                    "source": "Total GHG Emissions",
                    "relation": "HAS_VALUE",
                    "target": "1200000",
                    "description": "Total emissions value",
                    "source_component_ids": ["T1"],
                    "confidence": 0.80,
                },
            ],
            "claims": [
                {
                    "statement": "The company reduced total emissions by 15% compared to the previous year",
                    "claim_type": "quantitative",
                    "confidence": 0.75,
                },
            ],
        }

        content = json.dumps(mock_result)
        return ModelResponse(
            content=content,
            parsed=mock_result,
            model="mock",
            tokens_input=100,
            tokens_output=200,
            duration_seconds=0.01,
        )

    def get_name(self) -> str:
        return "mock/test"


class GroqProvider(ModelProvider):
    """Groq API provider for fast free inference."""

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        settings = get_settings()
        self.api_key = api_key or settings.openai_api_key
        self.model = model or "llama-3.1-8b-instant"

        if not self.api_key:
            raise ValueError("API Key is required for Groq provider")

        from openai import AsyncOpenAI
        # Groq is OpenAI compatible
        self.client = AsyncOpenAI(api_key=self.api_key, base_url="https://api.groq.com/openai/v1")

    async def generate(
        self,
        prompt: str,
        images: Optional[list[bytes]] = None,
        system_prompt: Optional[str] = None,
        temperature: float = 0.0,
        max_tokens: int = 4096,
        json_mode: bool = False,
    ) -> ModelResponse:
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        
        # Groq does not support multimodal in all models, so we ignore images for text models
        content = [{"type": "text", "text": prompt}]
        messages.append({"role": "user", "content": content})

        kwargs = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}

        start_time = time.time()
        response = await self.client.chat.completions.create(**kwargs)
        duration = time.time() - start_time

        raw_content = response.choices[0].message.content or ""
        parsed = None
        if json_mode:
            try:
                parsed = json.loads(raw_content)
            except json.JSONDecodeError:
                pass

        return ModelResponse(
            content=raw_content,
            parsed=parsed,
            model=self.model,
            tokens_input=response.usage.prompt_tokens if response.usage else 0,
            tokens_output=response.usage.completion_tokens if response.usage else 0,
            duration_seconds=duration,
            raw_response=response.model_dump(),
        )

    def get_name(self) -> str:
        return f"groq/{self.model}"


def get_model_provider(provider_type: Optional[str] = None) -> ModelProvider:
    """Factory: return the configured model provider."""
    settings = get_settings()
    provider = provider_type or settings.vlm_provider

    if provider == "openai":
        return OpenAIProvider()
    elif provider == "groq":
        return GroqProvider()
    elif provider == "mock":
        return MockProvider()
    else:
        raise ValueError(f"Unknown model provider: {provider}")

