from functools import lru_cache

from pydantic import AnyHttpUrl, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: AnyHttpUrl | None = None
    supabase_secret_key: str | None = None
    supabase_password: str | None = None
    database_url: str | None = None
    compstat_data_dir: str = "/home/radha/project/claude_impact_lab_compstat_rio/dados"
    replicate_api_token: str | None = None
    glm_ocr_model_version: str = "305df8d2d6079c27d03dea1c5e716382005153889bcebb5dbc32d1356cbd4eac"
    anthropic_api_key: str | None = None
    claude_model: str = "claude-sonnet-4-6"
    cors_origins: str = Field(default="*")
    log_level: str = "info"
    data_dir: str | None = None
    google_application_credentials: str | None = None
    gcp_project_id: str | None = None

    @property
    def resolved_database_url(self) -> str | None:
        """Connection string for direct Postgres access (ETL).

        Prefers DATABASE_URL when set. Otherwise composes the Supabase
        direct-connection URL (db.<ref>.supabase.co:5432) from SUPABASE_URL
        + SUPABASE_PASSWORD. If your network is IPv6-restricted, set
        DATABASE_URL explicitly to the Transaction Pooler URI from
        Supabase Studio.
        """
        if self.database_url:
            return self.database_url
        if not self.supabase_url or not self.supabase_password:
            return None
        from urllib.parse import quote

        host = str(self.supabase_url).split("//", 1)[-1].rstrip("/")
        ref = host.split(".", 1)[0]
        password = quote(self.supabase_password, safe="")
        return (
            f"postgresql://postgres:{password}"
            f"@db.{ref}.supabase.co:5432/postgres?sslmode=require"
        )

    @property
    def parsed_cors_origins(self) -> list[str]:
        if self.cors_origins.strip() == "*":
            return ["*"]
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
