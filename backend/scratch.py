import os
import sys
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")
django.setup()

from apps.jobs.models import Job
from apps.files.models import FileStatus, ExtractedRow
from apps.extraction.tasks import process_batch

# Get the last job that was created
job = Job.objects.order_by('-created_at').first()
if job:
    print(f"Testing process_batch for Job {job.id}")
    for f in job.files.all(): #type: ignore
        f.status = FileStatus.VERIFIED
        f.save()
        # Delete existing extracted rows
        ExtractedRow.objects.filter(file=f).delete()
        
    file_ids = [f.id for f in job.files.all()] #type: ignore
    process_batch(job.id, file_ids)
    print("Done")
else:
    print("No jobs found")
