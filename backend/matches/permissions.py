from rest_framework.permissions import SAFE_METHODS, BasePermission

from accounts.models import User


class IsScoutOrAdminOrReadOnly(BasePermission):
    """
    Public reads; writes require an authenticated SCOUT or ADMIN.

    Behaviour (via DRF's standard permission_denied handling):

      - GET / HEAD / OPTIONS       -> always allowed (public)
      - write + anonymous          -> 401 Not Authenticated
      - write + authenticated USER -> 403 Forbidden
      - write + SCOUT / ADMIN      -> allowed
    """

    message = "Only scouts and admins can perform this action."

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True

        user = request.user
        if not user or not user.is_authenticated:
            return False

        return user.role in (User.Role.SCOUT, User.Role.ADMIN)