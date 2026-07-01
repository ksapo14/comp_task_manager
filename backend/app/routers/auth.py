from fastapi import APIRouter

from ..dependencies import CurrentUser, Store
from ..profile import ensure_profile
from ..schemas import UserRead, UserUpdate

router = APIRouter(prefix="/auth", tags=["authentication"])


@router.get("/me", response_model=UserRead)
async def me(user: CurrentUser, store: Store) -> UserRead:
    return await ensure_profile(user, store)


@router.patch("/me", response_model=UserRead)
async def update_me(
    payload: UserUpdate,
    user: CurrentUser,
    store: Store,
) -> UserRead:
    profile = await ensure_profile(user, store)
    values = profile.model_dump(mode="json", exclude={"id"})
    values.update(payload.model_dump(mode="json"))
    updated = await store.set_profile(values)
    return UserRead(id=user.id, **updated)

