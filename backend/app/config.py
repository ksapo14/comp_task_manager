from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Compass API"
    cors_origins: str = "http://localhost:5173"
    frontend_url: str = "http://localhost:5173"
    vite_firebase_project_id: str = ""
    vite_firebase_api_key: str = ""
    firebase_auth_emulator_host: str = ""
    firestore_emulator_host: str = ""
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/api/google/callback"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
