import { useEffect } from "react";
import { Mic2, Sparkles, Download, X } from "lucide-react";
import "./OnboardingSheet.css";

const STORAGE_KEY = "riff_onboarded";

export function hasSeenOnboarding(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function markOnboardingSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // ignore
  }
}

const STEPS = [
  {
    icon: <Mic2 size={22} strokeWidth={1.6} />,
    label: "Record",
    desc: "Hit the button and play something.",
  },
  {
    icon: <Sparkles size={22} strokeWidth={1.6} />,
    label: "Detect",
    desc: "We analyze the notes and chord.",
  },
  {
    icon: <Download size={22} strokeWidth={1.6} />,
    label: "Export",
    desc: "Grab it as MIDI or audio.",
  },
];

interface OnboardingSheetProps {
  onClose: () => void;
}

export function OnboardingSheet({ onClose }: OnboardingSheetProps) {
  function handleClose() {
    markOnboardingSeen();
    onClose();
  }

  // close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="onboarding-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="How Riff works"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="onboarding-sheet">
        <button
          className="onboarding-close"
          onClick={handleClose}
          aria-label="Close"
        >
          <X size={18} strokeWidth={2} />
        </button>

        <p className="onboarding-kicker">How it works</p>
        <h2 className="onboarding-title">Three steps.</h2>

        <ol className="onboarding-steps">
          {STEPS.map((step) => (
            <li key={step.label} className="onboarding-step">
              <span className="onboarding-step-icon">{step.icon}</span>
              <div className="onboarding-step-body">
                <strong>{step.label}</strong>
                <span>{step.desc}</span>
              </div>
            </li>
          ))}
        </ol>

        <button className="onboarding-cta" onClick={handleClose}>
          Got it
        </button>
      </div>
    </div>
  );
}
