from accounts.models import User

from league.models import Team, TeamManager


class TeamManagerError(Exception):
    """Raised when a team-manager operation violates a domain rule."""


def add_team_manager(*, team, user):
    """
    Grant `user` manager access to `team`.

    Idempotent: re-adding an existing manager returns the existing row.
    """
    if not isinstance(user, User):
        raise TeamManagerError("A valid user is required.")
    if not isinstance(team, Team):
        raise TeamManagerError("A valid team is required.")

    existing = TeamManager.objects.filter(team=team, user=user).first()
    if existing is not None:
        return existing

    return TeamManager.objects.create(team=team, user=user)


def remove_team_manager(*, team, user):
    """
    Revoke `user`'s manager access to `team`.

    Raises TeamManagerError if the user is not currently a manager.
    """
    deleted, _ = TeamManager.objects.filter(team=team, user=user).delete()
    if not deleted:
        raise TeamManagerError("User is not a manager of this team.")


def is_team_manager(user, team):
    """
    True iff `user` has an explicit TeamManager row for `team`.
    Does NOT consider role overrides.
    """
    if not user or not user.is_authenticated:
        return False
    return TeamManager.objects.filter(team=team, user=user).exists()


def can_manage_team(user, team):
    """
    True iff `user` is authorized to perform team-management actions
    (including, eventually, lineup submission) for `team`.

    ADMINs and Django superusers have a system-wide override.
    Team managers are authorized for their assigned teams.
    """
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    if getattr(user, "role", None) == User.Role.ADMIN:
        return True
    return is_team_manager(user, team)