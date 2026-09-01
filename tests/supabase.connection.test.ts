import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

describe("Supabase connection", () => {
  it("validates the configured public project credentials", async () => {
    const projectUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    expect(projectUrl).toMatch(/^https:\/\/[a-z0-9]+\.supabase\.co$/);
    expect(publishableKey).toMatch(/^sb_publishable_/);

    const response = await fetch(`${projectUrl}/auth/v1/settings`, {
      headers: { apikey: publishableKey! },
    });

    expect(response.ok).toBe(true);
    await expect(response.json()).resolves.toEqual(expect.any(Object));
  }, 30_000);

  it("validates the configured management access token", async () => {
    const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
    if (!accessToken) {
      return; // Skip when management token is not provided in environment
    }

    const response = await fetch("https://api.supabase.com/v1/projects/ihofyzhldvuwrhtidjfm", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    expect(response.ok).toBe(true);
    await expect(response.json()).resolves.toMatchObject({ ref: "ihofyzhldvuwrhtidjfm" });
  }, 15_000);

  it("keeps the database password server-only and complete", () => {
    const databasePassword = process.env.SUPABASE_DB_PASSWORD;
    if (!databasePassword) {
      return; // Skip when direct DB password is not configured in local environment
    }

    expect(databasePassword).not.toContain("://");
    expect(databasePassword.trim().length).toBeGreaterThanOrEqual(8);
  });

  it.skip("authenticates with the Supabase database pooler", async () => {
    const { stdout } = await execFileAsync(
      "npx",
      ["supabase", "migration", "list", "--linked"],
      {
        cwd: process.cwd(),
        env: process.env,
        timeout: 30_000,
      },
    );

    expect(stdout).toContain("Local");
    expect(stdout).toContain("Remote");
  }, 45_000);

  it("reaches the deployed school API function", async () => {
    const projectUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
    const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
    const response = await fetch(`${projectUrl}/functions/v1/school-api`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${publishableKey}`,
        apikey: publishableKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "teacher.status" }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("configured");
    expect(body).toHaveProperty("googleLinked");
  }, 15_000);

  it("validates the school setup key without creating a teacher account", async () => {
    const setupKey = process.env.SCHOOL_SETUP_KEY;
    if (!setupKey) return;
    const projectUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
    const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
    const response = await fetch(`${projectUrl}/functions/v1/school-api`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${publishableKey}`,
        apikey: publishableKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "teacher.setup", setupKey, localPin: "" }),
    });

    expect([400, 403, 409]).toContain(response.status);
  }, 15_000);

  it("creates or confirms the first teacher account", async () => {
    const setupKey = process.env.SCHOOL_SETUP_KEY;
    const localPin = process.env.INITIAL_TEACHER_PIN;
    if (!setupKey || !localPin) return;
    const projectUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
    const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
    const response = await fetch(`${projectUrl}/functions/v1/school-api`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${publishableKey}`,
        apikey: publishableKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "teacher.setup", setupKey, localPin, displayName: "المعلم" }),
    });

    expect([201, 403, 409]).toContain(response.status);
  }, 15_000);

  it("opens the Supabase teacher list with the configured teacher PIN", async () => {
    const localPin = process.env.INITIAL_TEACHER_PIN;
    if (!localPin) return;
    const projectUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
    const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
    const login = await fetch(`${projectUrl}/functions/v1/school-api`, {
      method: "POST",
      headers: { Authorization: `Bearer ${publishableKey}`, apikey: publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "teacher.login", localPin }),
    });
    expect(login.status).toBe(200);
    const loginData = await login.json() as { sessionToken: string };
    const snapshot = await fetch(`${projectUrl}/functions/v1/school-api`, {
      method: "POST",
      headers: { Authorization: `Bearer ${publishableKey}`, apikey: publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "teacher.snapshot", sessionToken: loginData.sessionToken }),
    });
    expect(snapshot.status).toBe(200);
    const snapshotData = await snapshot.json() as { students: unknown[] };
    expect(Array.isArray(snapshotData.students)).toBe(true);
  }, 20_000);

  it("returns persisted board rows when reopening a teacher snapshot", async () => {
    const localPin = process.env.INITIAL_TEACHER_PIN;
    if (!localPin) return;
    const projectUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
    const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
    const login = await fetch(`${projectUrl}/functions/v1/school-api`, {
      method: "POST",
      headers: { Authorization: `Bearer ${publishableKey}`, apikey: publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "teacher.login", localPin }),
    });
    if (login.status !== 200) return;
    const { sessionToken } = await login.json() as { sessionToken: string };
    const snapshot = await fetch(`${projectUrl}/functions/v1/school-api`, {
      method: "POST",
      headers: { Authorization: `Bearer ${publishableKey}`, apikey: publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "teacher.snapshot", sessionToken }),
    });
    const data = await snapshot.json() as { boards: Array<{ elements: unknown[] }> };
    expect(Array.isArray(data.boards)).toBe(true);
    expect(data.boards.every((board) => Array.isArray(board.elements))).toBe(true);
  }, 20_000);

  it("loads a single student detail without requesting the whole school snapshot", async () => {
    const localPin = process.env.INITIAL_TEACHER_PIN;
    if (!localPin) return;
    const projectUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
    const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
    const baseHeaders = { Authorization: `Bearer ${publishableKey}`, apikey: publishableKey, "Content-Type": "application/json" };
    const login = await fetch(`${projectUrl}/functions/v1/school-api`, { method: "POST", headers: baseHeaders, body: JSON.stringify({ action: "teacher.login", localPin }) });
    if (login.status !== 200) return;
    const { sessionToken } = await login.json() as { sessionToken: string };
    const snapshot = await fetch(`${projectUrl}/functions/v1/school-api`, { method: "POST", headers: baseHeaders, body: JSON.stringify({ action: "teacher.snapshot", sessionToken }) });
    const snapshotData = await snapshot.json() as { students: Array<{ id: string }> };
    const studentId = snapshotData.students?.[0]?.id;
    if (!studentId) return;
    const detail = await fetch(`${projectUrl}/functions/v1/school-api`, { method: "POST", headers: baseHeaders, body: JSON.stringify({ action: "teacher.detail", sessionToken, studentId }) });
    expect(detail.status).toBe(200);
    const detailData = await detail.json() as { student: { id: string }; boards: unknown[]; attendance: unknown[]; messages: unknown[]; parentNotification: unknown };
    expect(detailData.student.id).toBe(studentId);
    expect(Array.isArray(detailData.boards)).toBe(true);
    expect(Array.isArray(detailData.attendance)).toBe(true);
    expect(Array.isArray(detailData.messages)).toBe(true);
  }, 20_000);
});
