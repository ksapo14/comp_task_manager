import {
  ArrowLeft,
  ArrowRight,
  Pencil,
  Plus,
  RotateCw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  FormEvent,
  KeyboardEvent,
  PointerEvent,
} from "react";

import { getFlashcardDeck, saveFlashcardDeck } from "./schoolApi";
import type { SchoolSyncState } from "./schoolApi";
import { SchoolSyncBadge } from "./SchoolSyncBadge";
import type { StudyCard } from "./types";

const SWIPE_THRESHOLD = 150;
const LEGACY_DEMO_CARD_IDS = new Set(["card-1", "card-2", "card-3", "card-4"]);

type SwipeDirection = "left" | "right";

interface DragState {
  pointerId: number;
  startX: number;
  x: number;
  moved: boolean;
}

interface CardDraft {
  id: string | null;
  course: string;
  question: string;
  answer: string;
}

const emptyCardDraft: CardDraft = {
  id: null,
  course: "",
  question: "",
  answer: "",
};

function newCardId() {
  return `card-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
}

export function FlashcardDeck() {
  const [cards, setCards] = useState<StudyCard[]>([]);
  const [flipped, setFlipped] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [dismissDirection, setDismissDirection] = useState<SwipeDirection | null>(null);
  const [mastered, setMastered] = useState(0);
  const [review, setReview] = useState(0);
  const [syncState, setSyncState] = useState<SchoolSyncState>("loading");
  const [cardDraft, setCardDraft] = useState<CardDraft | null>(null);
  const [formError, setFormError] = useState("");
  const drag = useRef<DragState | null>(null);
  const dismissalTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (dismissalTimer.current !== null) window.clearTimeout(dismissalTimer.current);
    },
    [],
  );

  useEffect(() => {
    let active = true;
    void getFlashcardDeck()
      .then((payload) => {
        if (!active) return;
        const nextCards = payload.cards.filter(
          (card) => !LEGACY_DEMO_CARD_IDS.has(card.id),
        );
        setCards(nextCards);
        setMastered(payload.mastered_count);
        setReview(payload.review_count);
        if (nextCards.length !== payload.cards.length) {
          setSyncState("saving");
          void saveFlashcardDeck({
            cards: nextCards,
            mastered_count: nextCards.length ? payload.mastered_count : 0,
            review_count: nextCards.length ? payload.review_count : 0,
          })
            .then(() => setSyncState("synced"))
            .catch(() => setSyncState("offline"));
          if (!nextCards.length) {
            setMastered(0);
            setReview(0);
          }
        } else {
          setSyncState("synced");
        }
      })
      .catch(() => {
        if (active) setSyncState("offline");
      });
    return () => {
      active = false;
    };
  }, []);

  const activeCard = cards[0];
  const swipeProgress = Math.min(Math.abs(dragX) / SWIPE_THRESHOLD, 1);
  const visualX = dismissDirection
    ? (dismissDirection === "right" ? 1 : -1) *
      Math.max(window.innerWidth, 900)
    : dragX;
  const rotation = Math.max(-12, Math.min(12, visualX / 24));

  function persistCards(
    nextCards: StudyCard[],
    nextMastered = mastered,
    nextReview = review,
  ) {
    setCards(nextCards);
    setSyncState("saving");
    void saveFlashcardDeck({
      cards: nextCards,
      mastered_count: nextMastered,
      review_count: nextReview,
    })
      .then(() => setSyncState("synced"))
      .catch(() => setSyncState("offline"));
  }

  function dismiss(direction: SwipeDirection) {
    if (!activeCard || dismissDirection) return;
    const nextCards = [...cards.slice(1), activeCard];
    const nextMastered = mastered + (direction === "right" ? 1 : 0);
    const nextReview = review + (direction === "left" ? 1 : 0);
    setDismissDirection(direction);
    setFlipped(false);
    setMastered(nextMastered);
    setReview(nextReview);
    setSyncState("saving");
    void saveFlashcardDeck({
      cards: nextCards,
      mastered_count: nextMastered,
      review_count: nextReview,
    })
      .then(() => setSyncState("synced"))
      .catch(() => setSyncState("offline"));
    dismissalTimer.current = window.setTimeout(() => {
      setCards(nextCards);
      setDragX(0);
      setDismissDirection(null);
    }, 390);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (dismissDirection) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      x: 0,
      moved: false,
    };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    const nextX = event.clientX - drag.current.startX;
    drag.current.x = nextX;
    drag.current.moved = drag.current.moved || Math.abs(nextX) > 8;
    setDragX(nextX);
  }

  function finishPointer(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    const releasedX = drag.current.x;
    const moved = drag.current.moved;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (Math.abs(releasedX) >= SWIPE_THRESHOLD) {
      dismiss(releasedX > 0 ? "right" : "left");
      return;
    }
    setDragX(0);
    if (!moved) setFlipped((value) => !value);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    setFlipped((value) => !value);
  }

  function startEdit(card: StudyCard) {
    setCardDraft({ ...card });
    setFormError("");
  }

  function submitCard(event: FormEvent) {
    event.preventDefault();
    if (!cardDraft) return;
    const course = cardDraft.course.trim();
    const question = cardDraft.question.trim();
    const answer = cardDraft.answer.trim();
    if (!course || !question || !answer) {
      setFormError("Class, question, and answer are all required.");
      return;
    }
    const card: StudyCard = {
      id: cardDraft.id ?? newCardId(),
      course,
      question,
      answer,
    };
    const nextCards = cardDraft.id
      ? cards.map((item) => (item.id === cardDraft.id ? card : item))
      : [card, ...cards];
    setFlipped(false);
    setCardDraft(null);
    setFormError("");
    persistCards(nextCards);
  }

  function deleteActiveCard() {
    if (!activeCard) return;
    const nextCards = cards.filter((card) => card.id !== activeCard.id);
    setFlipped(false);
    setCardDraft(null);
    persistCards(
      nextCards,
      nextCards.length ? mastered : 0,
      nextCards.length ? review : 0,
    );
    if (!nextCards.length) {
      setMastered(0);
      setReview(0);
    }
  }

  const cardStyle = {
    "--card-x": `${visualX}px`,
    "--card-rotation": `${rotation}deg`,
    "--swipe-progress": swipeProgress,
  } as CSSProperties;

  return (
    <section className="school-panel flashcard-studio h-full rounded-[2rem] p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="school-kicker">Active recall studio</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">Tactile flashcards</h2>
          <p className="mt-1 text-xs text-zinc-500">Flip to reveal. Swipe to score.</p>
          <SchoolSyncBadge state={syncState} />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex gap-2 text-[10px] font-semibold uppercase tracking-wider">
            <span className="rounded-full bg-emerald-50 px-2.5 py-1.5 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              {mastered} mastered
            </span>
            <span className="rounded-full bg-amber-50 px-2.5 py-1.5 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
              {review} review
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setCardDraft(emptyCardDraft);
              setFormError("");
            }}
            className="school-secondary-button"
          >
            <Plus size={14} />
            New card
          </button>
        </div>
      </div>

      {cardDraft && (
        <form onSubmit={submitCard} className="school-editor-panel mb-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">
              {cardDraft.id ? "Edit flashcard" : "Create flashcard"}
            </h3>
            <button
              type="button"
              onClick={() => setCardDraft(null)}
              className="school-icon-button"
              aria-label="Close flashcard editor"
            >
              <X size={15} />
            </button>
          </div>
          <div className="mt-3 grid gap-3">
            <label className="school-field-label">
              Class
              <input
                value={cardDraft.course}
                onChange={(event) =>
                  setCardDraft((current) =>
                    current ? { ...current, course: event.target.value } : current,
                  )
                }
                className="school-input mt-1"
                placeholder="Biology"
              />
            </label>
            <label className="school-field-label">
              Question
              <textarea
                value={cardDraft.question}
                onChange={(event) =>
                  setCardDraft((current) =>
                    current ? { ...current, question: event.target.value } : current,
                  )
                }
                className="school-input mt-1 min-h-20 resize-y"
                placeholder="What should you recall?"
              />
            </label>
            <label className="school-field-label">
              Answer
              <textarea
                value={cardDraft.answer}
                onChange={(event) =>
                  setCardDraft((current) =>
                    current ? { ...current, answer: event.target.value } : current,
                  )
                }
                className="school-input mt-1 min-h-24 resize-y"
                placeholder="Write the answer"
              />
            </label>
          </div>
          {formError && (
            <p role="alert" className="mt-3 text-xs font-medium text-red-600">
              {formError}
            </p>
          )}
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCardDraft(null)}
              className="school-secondary-button"
            >
              Cancel
            </button>
            <button type="submit" className="school-primary-button">
              {cardDraft.id ? "Save changes" : "Create card"}
            </button>
          </div>
        </form>
      )}

      {!activeCard && syncState !== "loading" && !cardDraft && (
        <div className="school-empty-state flashcard-empty-state">
          <Sparkles size={22} />
          <h3>No flashcards yet</h3>
          <p>Create a card from your class notes to start reviewing.</p>
          <button
            type="button"
            onClick={() => setCardDraft(emptyCardDraft)}
            className="school-primary-button"
          >
            <Plus size={14} />
            Create first card
          </button>
        </div>
      )}

      {activeCard && (
        <>
          <div className="mb-1 flex justify-end gap-1">
            <button
              type="button"
              onClick={() => startEdit(activeCard)}
              className="school-icon-button"
              aria-label={`Edit ${activeCard.question}`}
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              onClick={deleteActiveCard}
              className="school-icon-button school-danger-button"
              aria-label={`Delete ${activeCard.question}`}
            >
              <Trash2 size={14} />
            </button>
          </div>

          <div className="flashcard-arena">
            <div className="flashcard-stack" aria-live="polite">
              {[2, 1].map((depth) => (
                <div
                  key={depth}
                  aria-hidden="true"
                  className={`flashcard-underlay flashcard-underlay-${depth} ${
                    dismissDirection ? "is-promoting" : ""
                  }`}
                />
              ))}
              <div
                role="button"
                tabIndex={0}
                aria-label={`${flipped ? "Answer" : "Question"}: ${activeCard.question}`}
                className={`flashcard-active touch-none select-none ${
                  dragX > 0
                    ? "is-mastered-swipe"
                    : dragX < 0
                      ? "is-review-swipe"
                      : ""
                } ${dragX !== 0 && !dismissDirection ? "is-interacting" : ""} ${
                  dismissDirection ? "is-dismissing" : ""
                }`}
                style={cardStyle}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={finishPointer}
                onPointerCancel={finishPointer}
                onKeyDown={onKeyDown}
              >
                <span className="swipe-verdict swipe-verdict-review">Review</span>
                <span className="swipe-verdict swipe-verdict-mastered">Mastered</span>
                <div className={`flashcard-flipper ${flipped ? "is-flipped" : ""}`}>
                  <article className="flashcard-face flashcard-front">
                    <div className="flex items-center justify-between">
                      <span className="rounded-full bg-violet-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                        {activeCard.course}
                      </span>
                      <RotateCw size={15} className="text-zinc-300" />
                    </div>
                    <div className="my-auto py-8">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                        Question
                      </p>
                      <h3 className="mt-4 text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
                        {activeCard.question}
                      </h3>
                    </div>
                    <p className="text-xs text-zinc-400">
                      Tap anywhere to reveal the answer
                    </p>
                  </article>
                  <article className="flashcard-face flashcard-back">
                    <div className="flex items-center gap-2 text-emerald-600">
                      <Sparkles size={15} />
                      <span className="text-[10px] font-bold uppercase tracking-[0.18em]">
                        Answer
                      </span>
                    </div>
                    <p className="my-auto py-8 text-xl font-medium leading-8 text-zinc-700 dark:text-zinc-200">
                      {activeCard.answer}
                    </p>
                    <p className="text-xs text-zinc-400">
                      Swipe right if recalled, left to review
                    </p>
                  </article>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => dismiss("left")}
              disabled={Boolean(dismissDirection)}
              className="flashcard-score-button review"
            >
              <ArrowLeft size={15} />
              Review
            </button>
            <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-400">
              {cards.length} {cards.length === 1 ? "card" : "cards"}
            </span>
            <button
              type="button"
              onClick={() => dismiss("right")}
              disabled={Boolean(dismissDirection)}
              className="flashcard-score-button mastered"
            >
              Mastered
              <ArrowRight size={15} />
            </button>
          </div>
        </>
      )}
    </section>
  );
}
