import django.dispatch

# Signal emitted when all registered files for a job reach VERIFIED status
all_files_verified = django.dispatch.Signal()
