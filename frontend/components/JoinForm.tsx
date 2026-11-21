"use client";

// The sign-up form on /join. Two steps: name and phone, then a 3D campus map
// where the student taps their hall and their room. Saves a real student with
// a phone in a building, so the check-in agent calls them when an incident
// covers that building.
import { useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@rollcall/backend/convex/_generated/api";

const RoomPicker = dynamic(() => import("@/components/RoomPicker"), { ssr: false });

const inputClass =
  "w-full rounded-[10px] border border-slate-300 p-4 text-[15px] text-[#18334D]";

export type PickedRoom = { buildingName: string; room: string };

export default function JoinForm() {
  const buildings = useQuery(api.buildings.list);
  const signUp = useMutation(api.students.signUp);

  const [step, setStep] = useState<"details" | "map">("details");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ buildingName: string; phoneEnding: string } | null>(null);

  function handleContinue(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setStep("map");
  }

  async function handleConfirm(picked: PickedRoom) {
    const building = buildings?.find((b) => b.name === picked.buildingName);
    if (!building) {
      setError("Pick your hall on the map.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      setDone(await signUp({ name, phone, buildingId: building._id, room: picked.room }));
      setStep("details");
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

  return (
    <>
      <form onSubmit={handleContinue} className="flex flex-col gap-3">
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

        <button
          type="submit"
          className="cursor-pointer rounded-[10px] bg-[#18334D] p-4 text-base font-bold text-white"
        >
          Continue →
        </button>
        <p className="text-xs text-slate-400">
          Next you&apos;ll pick your room on the campus map. We only call this
          number during a campus emergency.
        </p>
      </form>

      {step === "map" && (
        <RoomPicker
          firstName={name.trim().split(/\s+/)[0] ?? ""}
          buildings={buildings}
          sending={sending}
          error={error}
          onBack={() => {
            setError(null);
            setStep("details");
          }}
          onConfirm={handleConfirm}
        />
      )}
    </>
  );
}
