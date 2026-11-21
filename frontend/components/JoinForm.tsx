"use client";

// The sign-up form on /join. Saves a real student with a phone in a building,
// so the check-in agent calls them when an incident covers that building.
import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@rollcall/backend/convex/_generated/api";
import type { Id } from "@rollcall/backend/convex/_generated/dataModel";

const inputClass =
  "w-full rounded-[10px] border border-slate-300 p-4 text-[15px] text-[#18334D]";

export default function JoinForm() {
  const buildings = useQuery(api.buildings.list);
  const signUp = useMutation(api.students.signUp);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [buildingId, setBuildingId] = useState("");
  const [room, setRoom] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ buildingName: string; phoneEnding: string } | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!buildingId) {
      setError("Pick your building.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      setDone(
        await signUp({
          name,
          phone,
          buildingId: buildingId as Id<"buildings">,
          room,
        }),
      );
    } catch (e) {
      setError(
        e instanceof ConvexError && typeof e.data === "string"
          ? e.data
          : "Something went wrong. Try again.",
      );
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col gap-3" aria-live="polite">
        <h3 className="text-2xl font-bold text-[#102a43]">You&apos;re signed up</h3>
        <p className="leading-relaxed text-slate-500">
          If there is an emergency at {done.buildingName}, Bear Call will call the
          number ending in {done.phoneEnding} to check on you.
        </p>
        <button
          type="button"
          onClick={() => setDone(null)}
          className="self-start text-sm font-medium text-[#18334D] underline"
        >
          Change my details
        </button>
      </div>
    );
  }

  const sorted = buildings ? [...buildings].sort((a, b) => a.name.localeCompare(b.name)) : [];

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label htmlFor="name" className="font-medium">
        Your name
      </label>
      <input
        id="name"
        name="name"
        autoComplete="name"
        required
        maxLength={60}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="First and last name"
        className={inputClass}
      />

      <label htmlFor="phone" className="font-medium">
        Your phone number
      </label>
      <input
        type="tel"
        id="phone"
        name="phone"
        autoComplete="tel"
        required
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Enter your phone number"
        className={inputClass}
      />

      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-3">
          <label htmlFor="building" className="font-medium">
            Building
          </label>
          <select
            id="building"
            name="building"
            required
            value={buildingId}
            onChange={(e) => setBuildingId(e.target.value)}
            disabled={buildings === undefined}
            className={`${inputClass} bg-white`}
          >
            <option value="">
              {buildings === undefined ? "Loading buildings..." : "Pick your building"}
            </option>
            {sorted.map((b) => (
              <option key={b._id} value={b._id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-3">
          <label htmlFor="room" className="font-medium">
            Room <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <input
            id="room"
            name="room"
            maxLength={20}
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            placeholder="e.g. 214"
            className={inputClass}
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={sending}
        className="cursor-pointer rounded-[10px] bg-[#18334D] p-4 text-base font-bold text-white disabled:opacity-60"
      >
        {sending ? "Signing you up..." : "Continue →"}
      </button>
      <p className="text-xs text-slate-400">
        We only call this number during a campus emergency.
      </p>
    </form>
  );
}
