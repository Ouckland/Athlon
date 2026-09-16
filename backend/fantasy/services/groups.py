import secrets
import string

from django.db import transaction

from fantasy.models import FantasyGroup, FantasyGroupMembership
from fantasy.services.teams import FantasyError


_INVITE_ALPHABET = string.ascii_uppercase + string.digits
_INVITE_LENGTH = 8


def _generate_invite_code():
    return "".join(secrets.choice(_INVITE_ALPHABET) for _ in range(_INVITE_LENGTH))


def create_group(*, owner, name):
    if not name or not name.strip():
        raise FantasyError("Group name is required.")

    code = None
    for _ in range(5):
        candidate = _generate_invite_code()
        if not FantasyGroup.objects.filter(invite_code=candidate).exists():
            code = candidate
            break
    if code is None:
        raise FantasyError("Could not generate a unique invite code.")

    with transaction.atomic():
        group = FantasyGroup.objects.create(
            name=name.strip(), invite_code=code, owner=owner
        )
        FantasyGroupMembership.objects.create(group=group, user=owner)
    return group


def join_group(*, user, invite_code):
    if not invite_code:
        raise FantasyError("Invite code is required.")

    group = FantasyGroup.objects.filter(
        invite_code=invite_code.strip().upper()
    ).first()
    if group is None:
        raise FantasyError("Invalid invite code.")

    if FantasyGroupMembership.objects.filter(group=group, user=user).exists():
        raise FantasyError("User is already a member of this group.")

    return FantasyGroupMembership.objects.create(group=group, user=user)