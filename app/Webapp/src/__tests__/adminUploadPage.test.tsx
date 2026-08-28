/**
 * /admin/upload — the two ways to add a file must behave identically.
 *
 * A coordinator reported that drag-and-drop shows the file progressing but the
 * "click to choose" picker does not. The page had ZERO test coverage (nothing in
 * src/__tests__/ or e2e/ referenced it), which is how a difference between the two
 * entry points could survive unnoticed. These tests drive the real component down
 * both paths with the same file and compare the resulting list state.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AdminUploadPage from "@/app/admin/upload/page";

// A name the client-side de-identification gate (DEID_NAME_RX) accepts.
const DEID_NAME = "AAAAAAAA_BBBBBBBB_CCCCCCCC.csv";

function makeFile(name: string = DEID_NAME): File {
  return new File(["speaker,text\nP,hello\n"], name, { type: "text/csv" });
}

/** Stub every endpoint the page touches. Returns the call log for assertions. */
function mockApi(uploads: unknown[] = []): string[] {
  const calls: string[] = [];
  const json = (body: unknown) =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    } as unknown as Response);

  global.fetch = jest.fn((input: unknown, init?: RequestInit) => {
    const url = String(input);
    calls.push(`${init?.method ?? "GET"} ${url.split("?")[0]}`);
    if (url.startsWith("/api/admin/upload-log")) return json({ uploads });
    if (url.startsWith("/api/backend/admin/upload-gate")) {
      return json({ busy: false, stale: false, queued: [], waiting_seconds: 0 });
    }
    if (url.startsWith("/api/backend/admin/upload-precheck")) return json({ duplicate: false });
    if (url.startsWith("/api/admin/upload-transcript")) return json({ queued: DEID_NAME });
    return json({});
  }) as unknown as typeof fetch;
  return calls;
}

function dropZone(): HTMLElement {
  return screen.getByText(/Drop files here/i).parentElement as HTMLElement;
}

function fileInput(): HTMLInputElement {
  return document.querySelector('input[type="file"]') as HTMLInputElement;
}

/** The rendered state of the file list — what the user actually sees. */
function listState(): { name: string; badge: string }[] {
  return screen.queryAllByRole("listitem").map((li) => {
    const spans = li.querySelectorAll("span");
    return {
      name: li.querySelector("p")?.textContent ?? "",
      badge: spans[spans.length - 1]?.textContent ?? "",
    };
  });
}

beforeEach(() => {
  mockApi();
});

describe("/admin/upload — drag-and-drop vs. click-to-choose", () => {
  it("adds the file to the list via drag-and-drop", async () => {
    render(<AdminUploadPage />);
    fireEvent.drop(dropZone(), { dataTransfer: { files: [makeFile()] } });

    await waitFor(() => expect(listState()).toHaveLength(1));
    expect(listState()[0].name).toBe(DEID_NAME);
  });

  it("adds the file to the list via the file picker", async () => {
    render(<AdminUploadPage />);
    await userEvent.upload(fileInput(), makeFile());

    await waitFor(() => expect(listState()).toHaveLength(1));
    expect(listState()[0].name).toBe(DEID_NAME);
  });

  it("both paths produce the SAME list state and the same Upload button state", async () => {
    // Path A — drop
    const a = render(<AdminUploadPage />);
    fireEvent.drop(dropZone(), { dataTransfer: { files: [makeFile()] } });
    await waitFor(() => expect(listState()).toHaveLength(1));
    const droppedState = listState();
    const droppedButtonEnabled = !(
      screen.getByRole("button", { name: /upload/i }) as HTMLButtonElement
    ).disabled;
    a.unmount();

    // Path B — picker
    render(<AdminUploadPage />);
    await userEvent.upload(fileInput(), makeFile());
    await waitFor(() => expect(listState()).toHaveLength(1));
    const pickedState = listState();
    const pickedButtonEnabled = !(
      screen.getByRole("button", { name: /upload/i }) as HTMLButtonElement
    ).disabled;

    expect(pickedState).toEqual(droppedState);
    expect(pickedButtonEnabled).toBe(droppedButtonEnabled);
  });

  it("the picker enforces `accept` but drag-and-drop does not", async () => {
    // This is the one real asymmetry between the entry points, and it is a browser
    // rule, not our code: `accept` filters the picker, while a drop bypasses it
    // entirely. So a file the coordinator CAN drag in may not even be visible in
    // the picker — which is how they end up choosing a different, wrong file.
    const a = render(<AdminUploadPage />);
    fireEvent.drop(dropZone(), { dataTransfer: { files: [makeFile("notes.txt")] } });
    await waitFor(() => expect(listState()).toHaveLength(1));
    expect(listState()[0].badge).toBe("invalid"); // drop accepted it, then flagged it
    a.unmount();

    render(<AdminUploadPage />);
    await userEvent.upload(fileInput(), makeFile("notes.txt"));
    // The picker refuses it outright — the file never reaches the list at all.
    expect(listState()).toHaveLength(0);
  });

  it("a rejected file explains why Upload is disabled", async () => {
    // D6: this is what the coordinator experienced as "clicking Upload does
    // nothing" — the row was flagged, but the disabled button read "Upload" with no
    // tooltip and no on-screen reason.
    render(<AdminUploadPage />);
    await userEvent.upload(fileInput(), makeFile("Patient 12 Visit 1.csv"));

    await waitFor(() => expect(listState()).toHaveLength(1));
    expect(listState()[0].badge).toBe("rejected");

    const button = screen.getByRole("button", { name: /nothing to upload/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toMatch(/not accepted/i);
    // and the same reason is visible on the page, not only in a tooltip
    expect(screen.getByText(/1 selected file was not accepted/i)).toBeInTheDocument();
  });

  it("shows the file as queued after a successful upload, not done", async () => {
    // D3: the POST only drops the file in the watcher's folder. The run itself takes
    // 3-12 minutes, and the page used to paint a green "done" the instant it
    // returned — the same badge a finished analysis gets.
    render(<AdminUploadPage />);
    await userEvent.upload(fileInput(), makeFile());
    await waitFor(() => expect(listState()).toHaveLength(1));

    await userEvent.click(screen.getByRole("button", { name: /^upload$/i }));
    await waitFor(() => expect(listState()[0].badge).toBe("queued"));
    expect(screen.getByText(/3-12 minutes/i)).toBeInTheDocument();
  });

  it("runs the duplicate precheck on both paths", async () => {
    const dropCalls = mockApi();
    const a = render(<AdminUploadPage />);
    fireEvent.drop(dropZone(), { dataTransfer: { files: [makeFile()] } });
    await waitFor(() =>
      expect(dropCalls.filter((c) => c.includes("upload-precheck"))).toHaveLength(1)
    );
    a.unmount();

    const pickCalls = mockApi();
    render(<AdminUploadPage />);
    await userEvent.upload(fileInput(), makeFile());
    await waitFor(() =>
      expect(pickCalls.filter((c) => c.includes("upload-precheck"))).toHaveLength(1)
    );
  });
});

describe("/admin/upload — pipeline state rebuilt from the server log", () => {
  it("renders the server's derived state instead of collapsing it to done", async () => {
    // D2: every row of admin_upload_log reads 'queued' forever (nothing advances the
    // column), and the page mapped anything non-error to a green "done". A file the
    // watcher was still working on looked exactly like a finished one.
    mockApi([
      { queued: "AAAA_BBBB_1.csv", status: "queued", state: "processing", elapsed_seconds: 240 },
      { queued: "AAAA_BBBB_2.csv", status: "queued", state: "analyzed", elapsed_seconds: 705 },
      { queued: "AAAA_BBBB_3.csv", status: "queued", state: "queued", elapsed_seconds: 4 },
      { queued: "AAAA_BBBB_4.csv", status: "error", state: "error", message: "Too large." },
    ]);
    render(<AdminUploadPage />);

    await waitFor(() => expect(listState()).toHaveLength(4));
    expect(listState().map((r) => r.badge)).toEqual([
      "processing",
      "analyzed",
      "queued",
      "error",
    ]);
    // and the elapsed time is on screen, so a long run does not read as a frozen page
    expect(screen.getByText("4 min")).toBeInTheDocument();
  });

  it("does not relabel a freshly picked file from an older run of the same name", async () => {
    // The re-upload trap: the server log still holds the PREVIOUS run for this name.
    // Applying it to the file the user just picked would show "analyzed" for a file
    // that has not been sent yet.
    mockApi([
      { queued: DEID_NAME, status: "queued", state: "analyzed", elapsed_seconds: 300 },
    ]);
    render(<AdminUploadPage />);
    await waitFor(() => expect(listState()).toHaveLength(1));

    await userEvent.upload(fileInput(), makeFile());
    await waitFor(() => expect(listState()).toHaveLength(2));

    const badges = listState().map((r) => r.badge);
    expect(badges).toContain("analyzed"); // the history row
    expect(badges).toContain("pending"); // the newly picked file, untouched
  });
});
