// Student landing page: what Bear Call is, and where to sign up. Owner: frontend.
// Ported from the standalone frontend/index.html on the LandingPage branch.
import Image from "next/image";
import JoinForm from "@/components/JoinForm";
import JoinQr from "@/components/JoinQr";

export default function JoinPage() {
  return (
    <div className="relative isolate grid flex-1 place-items-center overflow-hidden bg-[#90b6db] p-4 text-[#18334D] sm:p-6">
      {/* Campus render behind the card, washed out toward the middle so the card reads clearly. */}
      <Image
        src="/campus.webp"
        alt=""
        fill
        priority
        sizes="100vw"
        className="-z-20 object-cover"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[#eaf2fa]/30 bg-[radial-gradient(ellipse_at_center,rgba(234,242,250,0.8)_45%,rgba(234,242,250,0.4)_70%,transparent_95%)]"
      />
      <main className="w-full max-w-[860px] rounded-[20px] border border-white/60 bg-white/90 p-6 shadow-xl shadow-[#18334D]/10 backdrop-blur-md sm:p-10">
        <header className="flex items-center gap-4 sm:gap-6">
          <Image
            src="/icon.png"
            alt="Bear Call logo"
            width={160}
            height={160}
            priority
            className="h-20 w-20 shrink-0 sm:h-36 sm:w-36"
          />
          <div>
            <h1 className="text-[40px] leading-none font-extrabold tracking-tight text-[#102a43] sm:text-[60px]">
              Bear Call
            </h1>
            <p className="mt-2 text-base font-semibold whitespace-nowrap text-[#4a6a8a] sm:mt-3 sm:text-2xl">
              Campus safety check-in
            </p>
          </div>
        </header>

        <section className="mt-5">
          <p className="max-w-[650px] leading-relaxed text-slate-500">
            During a campus emergency, Bear Call contacts students to check on
            their safety and find out who needs assistance.
          </p>
        </section>

        <section className="mt-6 grid items-center gap-8 md:grid-cols-[1fr_1.5fr]">
          {/* On a phone you already scanned it, so the QR only shows on wider screens. */}
          <div className="hidden text-center md:block">
            <h3 className="mb-3 font-semibold">Scan to connect</h3>
            <JoinQr />
            <p className="mt-3">Access Bear Call check-in page.</p>
          </div>

          <JoinForm />
        </section>
      </main>
    </div>
  );
}
