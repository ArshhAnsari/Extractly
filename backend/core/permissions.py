"""
Object-level permission classes.

Key rule from the spec:
  Wrong user = 404, not 403.
  Do not confirm existence of other users' resources.

These permissions raise NotFoundError (404) on ownership mismatch
instead of the default PermissionDenied (403).
"""

from rest_framework.permissions import BasePermission

from core.exceptions import NotFoundError


class IsOwner(BasePermission):
    """
    Object-level permission: the object must belong to request.user.

    Works with any model that has a `user` FK or can be traced back
    to a user through an ownership chain. The view must implement
    `get_object()` which returns the model instance.

    Ownership resolution order:
      1. obj.user              — direct FK (Job model)
      2. obj.job.user          — one level deep (File model)
      3. obj.file.job.user     — two levels deep (ExtractedRow via file)
      4. obj.job (direct)      — ExtractedRow also has a direct job FK

    On mismatch: raises NotFoundError (404) so we never leak
    the existence of other users' resources.
    """

    def has_object_permission(self, request, view, obj):
        owner = self._resolve_owner(obj)

        if owner is None:
            # Cannot determine ownership — deny with 404
            raise NotFoundError("Resource not found.")

        if owner != request.user:
            raise NotFoundError("Resource not found.")

        return True

    @staticmethod
    def _resolve_owner(obj):
        """
        Walk the ownership chain to find the User who owns this object.
        Returns the User instance or None if chain can't be resolved.
        """
        # Direct user FK (e.g. Job.user)
        if hasattr(obj, "user_id"):
            return obj.user

        # One level: obj.job.user (e.g. File.job.user)
        if hasattr(obj, "job_id") and hasattr(obj, "job"):
            job = obj.job
            if hasattr(job, "user_id"):
                return job.user

        # Two levels: obj.file.job.user (e.g. ExtractedRow.file.job.user)
        if hasattr(obj, "file_id") and hasattr(obj, "file"):
            file_obj = obj.file
            if hasattr(file_obj, "job_id") and hasattr(file_obj, "job"):
                return file_obj.job.user

        return None
