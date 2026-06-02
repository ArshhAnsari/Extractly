from django.apps import AppConfig


class FilesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.files"
    verbose_name = "Files"

    def ready(self):
        from . import receivers  # noqa: F401
