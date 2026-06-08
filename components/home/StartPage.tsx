"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import IntroFlow from "@/components/intro/IntroFlow";
import { navigateWithFade } from "@/lib/navigation/navigateWithFade";
import { usePageFadeIn } from "@/lib/navigation/usePageFadeIn";
import { fadeOutMainBgm, preloadMainBgm, startMainBgm, stopHubBgm } from "@/lib/market/hubSounds";
import { resetGameProgress } from "@/lib/player/resetGameProgress";
import { usePlayerStore } from "@/store/playerStore";
import { useNarrativeStore } from "@/store/narrativeStore";

type BootPhase = "loading" | "intro" | "home";
type NicknamePhase = "input" | "continue" | "finished" | "new";
type BgFade = "hidden" | "visible" | "leaving";

function StartPageBackground({ fade }: { fade: BgFade }) {
  const fadeClass =
    fade === "visible" ? "is-visible" : fade === "leaving" ? "is-leaving" : "";

  return (
    <div className={`start-page__bg ${fadeClass}`.trim()} aria-hidden>
      <div className="start-page__video-stage">
        <video
          className="start-page__video"
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
        >
          <source src="/narrative/intro.webm" type="video/webm" />
          <source src="/narrative/intro.mp4" type="video/mp4" />
        </video>
        <div className="start-page__chromatic start-page__chromatic--r" />
        <div className="start-page__chromatic start-page__chromatic--b" />
      </div>
      <div className="start-page__scanlines" />
      <div className="start-page__noise" />
      <div className="start-page__overlay" />
    </div>
  );
}

export default function StartPage() {
  const router = useRouter();
  usePageFadeIn();

  const hydratePlayers = usePlayerStore((s) => s.hydrate);
  const playersHydrated = usePlayerStore((s) => s.hydrated);
  const findRecord = usePlayerStore((s) => s.findRecord);
  const beginNewRun = usePlayerStore((s) => s.beginNewRun);
  const resumeRun = usePlayerStore((s) => s.resumeRun);

  const hydrateNarrative = useNarrativeStore((s) => s.hydrate);
  const narrativeHydrated = useNarrativeStore((s) => s.hydrated);
  const introDone = useNarrativeStore((s) => s.introDone);

  const [bootPhase, setBootPhase] = useState<BootPhase>("loading");
  const [bgFade, setBgFade] = useState<BgFade>("hidden");
  const [showButtons, setShowButtons] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [nickname, setNickname] = useState("");
  const [phase, setPhase] = useState<NicknamePhase>("input");
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    hydratePlayers();
    hydrateNarrative();
    stopHubBgm();
  }, [hydratePlayers, hydrateNarrative]);

  useEffect(() => {
    if (!playersHydrated || !narrativeHydrated) return;
    setBootPhase(introDone ? "home" : "intro");
  }, [playersHydrated, narrativeHydrated, introDone]);

  useEffect(() => {
    if (bootPhase !== "home") {
      setBgFade("hidden");
      setShowButtons(false);
      return;
    }
    setShowButtons(false);
    stopHubBgm();
    preloadMainBgm();
    const frame = requestAnimationFrame(() => setBgFade("visible"));
    return () => {
      cancelAnimationFrame(frame);
      void fadeOutMainBgm();
      setBgFade("hidden");
      setShowButtons(false);
    };
  }, [bootPhase]);

  const revealButtons = useCallback(() => {
    startMainBgm();
    setShowButtons(true);
  }, []);

  const leaveHome = useCallback(
    async (href: string) => {
      setBgFade("leaving");
      await fadeOutMainBgm();
      await navigateWithFade(router, href);
    },
    [router],
  );

  const enterMarket = useCallback(async () => {
    await leaveHome("/market");
  }, [leaveHome]);

  const resolveNickname = useCallback(() => {
    const trimmed = nickname.trim();
    if (!trimmed) return;

    const record = findRecord(trimmed);
    if (!record) {
      setPhase("new");
      setStatusMessage("尚無此玩家紀錄，將新增玩家紀錄開啟新遊戲");
      return;
    }
    if (record.endingId) {
      setPhase("finished");
      setStatusMessage("已有此玩家紀錄，上一輪遊戲已結束，將開啟新遊戲");
      return;
    }
    if (record.isActive) {
      setPhase("continue");
      setStatusMessage("已有此玩家紀錄，請選擇繼續遊戲或開啟新遊戲");
      return;
    }
    setPhase("new");
    setStatusMessage("尚無此玩家紀錄，將新增玩家紀錄開啟新遊戲");
  }, [findRecord, nickname]);

  const confirmNewGame = useCallback(() => {
    const trimmed = nickname.trim();
    if (!trimmed) return;
    resetGameProgress();
    beginNewRun(trimmed);
    setModalOpen(false);
    void enterMarket();
  }, [beginNewRun, nickname, enterMarket]);

  const confirmContinue = useCallback(() => {
    const trimmed = nickname.trim();
    if (!trimmed) return;
    resumeRun(trimmed);
    setModalOpen(false);
    void enterMarket();
  }, [nickname, resumeRun, enterMarket]);

  const openStartModal = () => {
    setNickname("");
    setPhase("input");
    setStatusMessage("");
    setModalOpen(true);
  };

  if (bootPhase === "loading") {
    return (
      <div className="start-page min-h-screen flex items-center justify-center">
        <p className="text-sm opacity-60">載入中…</p>
      </div>
    );
  }

  if (bootPhase === "intro") {
    return (
      <IntroFlow
        onComplete={() => {
          setBootPhase("home");
        }}
      />
    );
  }

  return (
    <div className="start-page">
      <StartPageBackground fade={bgFade} />
      <div className="start-page__content">
        <div className="w-full max-w-xl flex flex-col items-center gap-8">
          <header
            className={`start-page__header text-center space-y-2${showButtons ? "" : " start-page__header--clickable"}`}
            onClick={showButtons ? undefined : revealButtons}
            onKeyDown={
              showButtons
                ? undefined
                : (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      revealButtons();
                    }
                  }
            }
            role={showButtons ? undefined : "button"}
            tabIndex={showButtons ? undefined : 0}
          >
            <h1 className="start-page__title game-title text-2xl sm:text-3xl tracking-widest">
              <span className="start-page__title-base">無人夜市</span>
              <span className="start-page__title-ghost start-page__title-ghost--r" aria-hidden>
                無人夜市
              </span>
              <span className="start-page__title-ghost start-page__title-ghost--b" aria-hidden>
                無人夜市
              </span>
            </h1>
            <p className="start-page__subtitle text-sm opacity-70 tracking-wide">
              Night Market of Solitude
            </p>
          </header>

          <div
            className={`start-page__actions flex flex-col sm:flex-row items-center gap-4${showButtons ? " is-visible" : ""}`}
          >
          <button type="button" className="game-btn-primary text-base px-10 py-3" onClick={openStartModal}>
            開始遊戲
          </button>
          <Link
            href="/leaderboard"
            className="game-btn-ghost text-base px-10 py-3"
            data-ui-sound="enter"
            onClick={(e) => {
              e.preventDefault();
              void leaveHome("/leaderboard");
            }}
          >
            排行榜
          </Link>
          </div>
        </div>
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="game-panel w-full max-w-md p-6 space-y-4">
            <h2 className="game-title text-center text-lg">輸入玩家暱稱</h2>

            {phase === "input" ? (
              <>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") resolveNickname();
                  }}
                  className="w-full px-3 py-2 bg-paper border-2 border-ink text-ink text-sm"
                  placeholder="請輸入暱稱"
                  maxLength={20}
                  autoFocus
                />
                <div className="flex justify-end gap-3">
                  <button type="button" className="game-btn-ghost" onClick={() => setModalOpen(false)}>
                    取消
                  </button>
                  <button
                    type="button"
                    className="game-btn-primary"
                    disabled={!nickname.trim()}
                    onClick={resolveNickname}
                  >
                    下一步
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm leading-relaxed">{statusMessage}</p>
                <p className="text-xs opacity-70">玩家：{nickname.trim()}</p>
                <div className="flex flex-wrap justify-end gap-3">
                  <button type="button" className="game-btn-ghost" onClick={() => setPhase("input")}>
                    返回
                  </button>
                  {phase === "continue" ? (
                    <>
                      <button type="button" className="game-btn-ghost" onClick={confirmNewGame}>
                        開啟新遊戲
                      </button>
                      <button type="button" className="game-btn-primary" onClick={confirmContinue}>
                        繼續遊戲
                      </button>
                    </>
                  ) : (
                    <button type="button" className="game-btn-primary" onClick={confirmNewGame}>
                      開始
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
