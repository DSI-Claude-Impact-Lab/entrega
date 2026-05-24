from typing import Any

import httpx
from fastapi import HTTPException, status


class ReplicateClient:
    def __init__(self, token: str | None) -> None:
        self.token = token

    def _headers(self) -> dict[str, str]:
        if not self.token:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Replicate token is not configured",
            )
        return {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }

    async def account(self) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(
                "https://api.replicate.com/v1/account",
                headers=self._headers(),
            )
        if response.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Replicate account check failed",
            )
        return response.json()

    async def create_prediction(
        self,
        payload: dict[str, Any],
        *,
        wait_seconds: int | None = 30,
    ) -> dict[str, Any]:
        headers = self._headers()
        if wait_seconds is not None:
            headers["Prefer"] = f"wait={wait_seconds}"

        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                "https://api.replicate.com/v1/predictions",
                headers=headers,
                json=payload,
            )
        if response.status_code >= 400:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={
                    "message": "Replicate prediction request failed",
                    "status_code": response.status_code,
                    "body": response.text[:1000],
                },
            )
        return response.json()
