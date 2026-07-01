from datetime import datetime, timezone

from .dependencies import AuthenticatedUser
from .firestore import FirestoreREST
from .schemas import UserRead


async def ensure_profile(
    user: AuthenticatedUser,
    store: FirestoreREST,
) -> UserRead:
    profile = await store.get_profile()
    if not profile:
        profile = await store.set_profile(
            {
                "email": user.email,
                "preferred_start_time": "08:00:00",
                "preferred_end_time": "22:00:00",
                "created_at": datetime.now(timezone.utc),
            }
        )
    return UserRead(id=user.id, **profile)

