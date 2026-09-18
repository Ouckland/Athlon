from accounts.models import User
from rest_framework.permissions import SAFE_METHODS, BasePermission


class IsAdminOrReadOnly(BasePermission):
    """
    Public reads; writes require an authenticated ADMIN.

    MVP note: there is no per-competition administrator model yet. The
    global ADMIN role stands in for "competition admin" until that concept
    is introduced. This class is the seam where the per-competition check
    will live when it exists.

    Behaviour:
      - GET / HEAD / OPTIONS       -> always allowed
      - write + anonymous          -> 401 (handled by DRF's permission_denied)
      - write + USER or SCOUT      -> 403
      - write + ADMIN              -> allowed
    """

    message = "Only admins can manage competition participation."

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        user = request.user
        if not user or not user.is_authenticated:
            return False
        return user.role == User.Role.ADMIN