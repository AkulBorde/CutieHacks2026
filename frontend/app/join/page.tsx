// Student landing page: what Bear Call is, and where to sign up. Owner: frontend.
// Ported from the standalone frontend/index.html on the LandingPage branch.
import Image from "next/image";

export default function JoinPage() {
  return (
    <div className="grid flex-1 place-items-center bg-[#90b6db] p-4 text-[#18334D] sm:p-6">
      <main className="w-full max-w-[1200px] rounded-[20px] bg-white p-6 sm:p-[60px]">
        <header>
          <Image
            src="/icon.png"
            alt="Bear Call logo"
            width={150}
            height={150}
            priority
          />
          <h1 className="mt-2 mb-2 text-[42px] font-bold text-[#102a43]">
            Bear Call
          </h1>
          <p className="text-lg font-bold tracking-[2px] text-slate-500">
            CAMPUS SAFETY CHECK IN
          </p>
        </header>

        <section className="mt-[35px]">
          <p className="max-w-[650px] leading-relaxed text-slate-500">
            During a campus emergency, Bear Call contacts students to check on
            their safety and find out who needs assistance.
          </p>
        </section>

        <section className="mt-[30px] grid items-center gap-[35px] md:grid-cols-[1fr_1.5fr]">
          <div className="text-center">
            <h3 className="mb-3 font-semibold">Scan to connect</h3>
            <div className="mx-auto grid h-[190px] w-[190px] place-items-center rounded-lg border-2 border-dashed border-slate-300 text-sm text-slate-400">
              QR code
            </div>
            <p className="mt-3">Access Bear Call check-in page.</p>
          </div>

          <form className="flex flex-col gap-3">
            <label htmlFor="phone" className="font-medium">
              Your phone number
            </label>
            <input
              type="tel"
              id="phone"
              name="phone"
              autoComplete="tel"
              placeholder="Enter your phone number"
              className="w-full rounded-[10px] border border-slate-300 p-4 text-[15px]"
            />
            <button
              type="button"
              className="cursor-pointer rounded-[10px] bg-[#18334D] p-4 text-base font-bold text-white"
            >
              Continue →
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
