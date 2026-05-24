from typing import Any

from app.config.settings import Settings
from app.integrations.replicate_client import ReplicateClient


class ReplicateService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client = ReplicateClient(settings.replicate_api_token)

    async def account_summary(self) -> dict[str, Any]:
        account = await self._client.account()
        return {
            "status": "ok",
            "username": account.get("username"),
            "type": account.get("type"),
        }

    async def create_prediction(
        self,
        *,
        version: str,
        input_payload: dict[str, Any],
        wait_seconds: int | None = 30,
    ) -> dict[str, Any]:
        prediction = await self._client.create_prediction(
            {"version": version, "input": input_payload},
            wait_seconds=wait_seconds,
        )
        return {"prediction": prediction}

    async def glm_ocr(
        self,
        *,
        image_url: str,
        task: str,
        custom_prompt: str,
        max_new_tokens: int,
    ) -> dict[str, Any]:
        return await self.create_prediction(
            version=self._settings.glm_ocr_model_version,
            input_payload={
                "image": image_url,
                "task": task,
                "custom_prompt": custom_prompt,
                "max_new_tokens": max_new_tokens,
            },
            wait_seconds=30,
        )

    async def segment(self, input_payload: dict[str, Any]) -> dict[str, Any]:
        return await self.create_prediction(
            version="meta/sam-2",
            input_payload=input_payload,
            wait_seconds=30,
        )
