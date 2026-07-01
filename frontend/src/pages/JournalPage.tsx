import { format } from "date-fns";
import { FilePlus2, Save, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";

import { Button, Card, EmptyState, Input, PageHeader } from "../components/ui";
import { api } from "../lib/api";
import type { Course, Journal } from "../types";

const starter = `## Today

What did I build, learn, or debug?

\`\`\`python
def insight():
    return "Write the useful detail before it disappears."
\`\`\`
`;

export function JournalPage() {
  const [entries, setEntries] = useState<Journal[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState(starter);
  const [courseId, setCourseId] = useState("");
  const [preview, setPreview] = useState(false);
  const active = entries.find((entry) => entry.id === activeId);

  async function load() {
    const [journalData, courseData] = await Promise.all([
      api<Journal[]>("/journals"),
      api<Course[]>("/courses"),
    ]);
    setEntries(journalData);
    setCourses(courseData);
    return journalData;
  }

  useEffect(() => {
    void load();
  }, []);

  function selectEntry(entry: Journal) {
    setActiveId(entry.id);
    setTitle(entry.title);
    setContent(entry.content_markdown);
    setCourseId(entry.course_id ?? "");
  }

  function newEntry() {
    setActiveId(null);
    setTitle("");
    setContent(starter);
    setCourseId("");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    const body = { title, content_markdown: content, course_id: courseId || null };
    const entry = activeId
      ? await api<Journal>(`/journals/${activeId}`, { method: "PUT", body })
      : await api<Journal>("/journals", { method: "POST", body });
    await load();
    setActiveId(entry.id);
  }

  async function remove() {
    if (!activeId) return;
    await api(`/journals/${activeId}`, { method: "DELETE" });
    newEntry();
    await load();
  }

  return (
    <>
      <PageHeader
        eyebrow="Developer journal"
        title="Think in durable form."
        description="Capture architecture decisions, debugging trails, and the human side of difficult work."
        action={
          <Button variant="secondary" onClick={newEntry}>
            <FilePlus2 size={16} />
            New entry
          </Button>
        }
      />
      <div className="grid min-h-[650px] gap-5 xl:grid-cols-[260px_1fr]">
        <Card className="p-3">
          <p className="px-2 pb-3 pt-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">Entries</p>
          {entries.length ? (
            <div className="space-y-1">
              {entries.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => selectEntry(entry)}
                  className={`w-full rounded-xl p-3 text-left ${activeId === entry.id ? "bg-zinc-100 dark:bg-zinc-800" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"}`}
                >
                  <p className="truncate text-sm font-medium">{entry.title}</p>
                  <p className="mt-1 text-[10px] text-zinc-400">{format(new Date(entry.updated_at), "MMM d · h:mm a")}</p>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState>No entries yet.</EmptyState>
          )}
        </Card>
        <Card>
          <form onSubmit={save} className="flex h-full flex-col">
            <div className="mb-4 grid gap-3 md:grid-cols-[1fr_180px_auto]">
              <Input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Entry title" />
              <select className="select-field" value={courseId} onChange={(event) => setCourseId(event.target.value)}>
                <option value="">General</option>
                {courses.map((course) => <option key={course.id} value={course.id}>{course.code}</option>)}
              </select>
              <div className="flex rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800">
                {["Write", "Preview"].map((item) => (
                  <button type="button" key={item} onClick={() => setPreview(item === "Preview")} className={`rounded-lg px-3 text-xs font-medium ${preview === (item === "Preview") ? "bg-white shadow-sm dark:bg-zinc-700" : "text-zinc-500"}`}>
                    {item}
                  </button>
                ))}
              </div>
            </div>
            {preview ? (
              <div className="prose-compass min-h-[480px] flex-1 overflow-y-auto rounded-xl border p-5">
                <ReactMarkdown rehypePlugins={[rehypeHighlight]}>{content}</ReactMarkdown>
              </div>
            ) : (
              <textarea
                className="textarea-field min-h-[480px] flex-1 resize-none font-mono leading-7"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                spellCheck
              />
            )}
            <div className="mt-4 flex items-center justify-between">
              <div className="text-xs text-zinc-400">
                {active ? `Last saved ${format(new Date(active.updated_at), "h:mm a")}` : "Unsaved draft"}
              </div>
              <div className="flex gap-2">
                {activeId && <Button type="button" variant="ghost" onClick={remove}><Trash2 size={15} /> Delete</Button>}
                <Button><Save size={15} /> Save entry</Button>
              </div>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}

