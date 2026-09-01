import { createHeartbeatJob, listHeartbeatJobs } from "./_core/heartbeat";

const JOB_NAME = "quran-school-daily-cloud-backup";

export async function ensureDailyCloudBackupSchedule() {
  const jobs = await listHeartbeatJobs("", { page: 1, pageSize: 100 });
  const existing = jobs.jobs.find((job) => job.name === JOB_NAME);
  if (existing) return { taskUid: existing.taskUid, existing: true };
  const created = await createHeartbeatJob({
    name: JOB_NAME,
    cron: "0 0 1 * * *",
    path: "/api/scheduled/daily-cloud-backup",
    method: "POST",
    description: "نسخة سحابية يومية من بيانات المدرسة القرآنية",
  }, "");
  return { taskUid: created.taskUid, existing: false };
}
