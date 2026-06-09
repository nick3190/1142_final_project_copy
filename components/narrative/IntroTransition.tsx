"use client";

import Image from "next/image";
import { useEffect } from "react";
import HubSceneOverlay from "@/components/narrative/HubSceneOverlay";
import { INTRO_TRANSITION_FLASH, introSceneSrc } from "@/lib/narrative/introAssets";
import type { TransitionKind, VisualKind } from "@/lib/narrative/types";

const TRANSITION_MS = 500;

type Props = {
  kind: TransitionKind;
  reveals?: VisualKind;
  overlay?: boolean;
  onDone: () => void;
};

export default function IntroTransition({ kind, reveals, overlay = false, onDone }: Props) {
  useEffect(() => {
    const doneTimer = window.setTimeout(onDone, TRANSITION_MS);
    return () => clearTimeout(doneTimer);
  }, [kind, onDone]);

  const rootClass = overlay
    ? "intro-transition intro-transition--overlay absolute inset-0 z-[15] pointer-events-none"
    : "intro-transition fixed inset-0 z-[80]";

  if (kind === "flash-transition") {
    return (
      <div className={`${rootClass} intro-transition--flash bg-black`}>
        <Image
          src={INTRO_TRANSITION_FLASH}
          alt=""
          fill
          unoptimized
          className="object-cover object-center hub-world-bg-image"
          sizes="100vw"
          priority
        />
        <HubSceneOverlay />
      </div>
    );
  }

  if (kind === "fade-reveal") {
    const revealSrc =
      (reveals && introSceneSrc(reveals)) ?? introSceneSrc("market-weird")!;
    return (
      <div className={`${rootClass} intro-transition--reveal bg-black hub-world-bg`}>
        <div className="intro-transition__reveal-scene">
          <Image
            src={revealSrc}
            alt=""
            fill
            unoptimized
            className="object-cover object-center hub-world-bg-image intro-transition__reveal-image"
            sizes="100vw"
            priority
          />
        </div>
        <HubSceneOverlay />
      </div>
    );
  }

  if (kind === "fade-glowing") {
    return (
      <div className={`${rootClass} intro-transition--glow hub-world-bg`}>
        <div className="intro-transition__glow-to">
          <Image
            src={introSceneSrc("glowing-stall")!}
            alt=""
            fill
            unoptimized
            className="object-cover object-center hub-world-bg-image"
            sizes="100vw"
          />
        </div>
      </div>
    );
  }

  if (kind === "fade-dark") {
    return <div className={`${rootClass} intro-transition--fade-dark bg-black`} />;
  }

  return (
    <div className={`${rootClass} hub-shell flex items-center justify-center`}>
      <p className="game-panel px-6 py-4 text-sm tracking-widest">遊戲提示（待輸入）</p>
    </div>
  );
}
