"use client";

import type { ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faAnglesUp,
  faAnglesDown,
  faAngleUp,
  faAngleDown,
  faBold,
  faCopy,
  faTrashCan,
  faBarsStaggered,
  faHashtag,
  faSquare,
  faRulerHorizontal,
  faSignature,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import type { ElementStyle, FillStyle, Sloppiness, StrokeStyle } from "../types";
import ColorSwatches from "./ColorSwatches";
import { BACKGROUND_SWATCHES, STROKE_SWATCHES, TRANSPARENT_COLOR } from "../lib/color";
import { FONT_SIZE_OPTIONS, STROKE_WIDTH_OPTIONS } from "../lib/elementStyle";
import { cn } from "../lib/cn";
import { FONT_FAMILY_OPTIONS, getFontFamilyClass } from "../lib/fonts";
import Dropdown from "./Dropdown";

const STROKE_STYLE_OPTIONS: { value: StrokeStyle; label: string }[] = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
];

const FILL_STYLE_OPTIONS: { value: FillStyle; label: string; icon: IconDefinition }[] = [
  { value: "hachure", label: "Hachure", icon: faBarsStaggered },
  { value: "cross-hatch", label: "Cross-hatch", icon: faHashtag },
  { value: "solid", label: "Solid", icon: faSquare },
];

const SLOPPINESS_OPTIONS: { value: Sloppiness; label: string; icon: IconDefinition }[] = [
  { value: "clean", label: "Clean", icon: faRulerHorizontal },
  { value: "sketchy", label: "Hand-drawn", icon: faSignature },
];

// Previews of a stroke's width/dash pattern — value swatches, like the
// color swatches, rather than icons.
const STROKE_PREVIEW_WIDTH = 18;
const STROKE_STYLE_PREVIEW_THICKNESS = 2;

const OPACITY_STEP = 10;

export interface StyleSource {
  [key: string]: unknown;
}

interface Props {
  // Every selected element's data — or, with nothing selected, a prototype
  // for the active drawing tool so the style can be picked before drawing.
  sources: StyleSource[];
  cardColor: string | null;
  cardSwatches: { label: string; value: string }[];
  hasSelection: boolean;
  onStyleChange: (patch: Partial<ElementStyle>) => void;
  onCardColorChange: (color: string) => void;
  onBringToFront: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onSendToBack: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  style?: React.CSSProperties;
}

function readStyleValue<Key extends keyof ElementStyle>(sources: StyleSource[], key: Key): ElementStyle[Key] | undefined {
  const source = sources.find((candidate) => key in candidate);
  return source?.[key] as ElementStyle[Key] | undefined;
}

export default function StylePanel({
  sources,
  cardColor,
  cardSwatches,
  hasSelection,
  onStyleChange,
  onCardColorChange,
  onBringToFront,
  onBringForward,
  onSendBackward,
  onSendToBack,
  onDuplicate,
  onDelete,
  style,
}: Props) {
  const strokeColor = readStyleValue(sources, "strokeColor");
  const backgroundColor = readStyleValue(sources, "backgroundColor");
  const fillStyle = readStyleValue(sources, "fillStyle");
  const strokeWidth = readStyleValue(sources, "strokeWidth");
  const strokeStyle = readStyleValue(sources, "strokeStyle");
  const sloppiness = readStyleValue(sources, "sloppiness");
  const fontFamily = readStyleValue(sources, "fontFamily");
  const fontSize = readStyleValue(sources, "fontSize");
  const fontWeight = readStyleValue(sources, "fontWeight");
  const opacity = readStyleValue(sources, "opacity");
  const hasAnyFill = sources.some(
    (source) => typeof source.backgroundColor === "string" && source.backgroundColor !== TRANSPARENT_COLOR,
  );
  const isOnlyText = sources.length > 0 && sources.every((source) => "text" in source);

  return (
    <div
      role="toolbar"
      aria-label="Element style"
      className="fixed z-[950] w-[212px] max-h-[calc(100vh-140px)] overflow-y-auto cc-scroll
                 flex flex-col gap-3 p-3 rounded-xl bg-surface-raised border border-border 
                 select-none font-sans animate-node-in"
      style={style}
    >
      {strokeColor !== undefined && (
        <Section title={isOnlyText ? "Text color" : "Stroke"}>
          <ColorSwatches
            color={strokeColor}
            swatches={STROKE_SWATCHES}
            allowCustom
            onChange={(color) => onStyleChange({ strokeColor: color })}
          />
        </Section>
      )}

      {backgroundColor !== undefined && (
        <Section title="Background">
          <ColorSwatches
            color={backgroundColor}
            swatches={BACKGROUND_SWATCHES}
            allowCustom
            onChange={(color) => onStyleChange({ backgroundColor: color })}
          />
        </Section>
      )}

      {fillStyle !== undefined && hasAnyFill && (
        <Section title="Fill">
          <ButtonRow>
            {FILL_STYLE_OPTIONS.map((option) => (
              <OptionButton
                key={option.value}
                label={option.label}
                isActive={fillStyle === option.value}
                onClick={() => onStyleChange({ fillStyle: option.value })}
              >
                <FontAwesomeIcon icon={option.icon} className="w-3 h-3" />
              </OptionButton>
            ))}
          </ButtonRow>
        </Section>
      )}

      {strokeWidth !== undefined && (
        <Section title="Stroke width">
          <ButtonRow>
            {STROKE_WIDTH_OPTIONS.map((option) => (
              <OptionButton
                key={option.value}
                label={option.label}
                isActive={strokeWidth === option.value}
                onClick={() => onStyleChange({ strokeWidth: option.value })}
              >
                <span
                  className="block rounded-full bg-current"
                  style={{ width: STROKE_PREVIEW_WIDTH, height: option.value + 1 }}
                />
              </OptionButton>
            ))}
          </ButtonRow>
        </Section>
      )}

      {strokeStyle !== undefined && (
        <Section title="Stroke style">
          <ButtonRow>
            {STROKE_STYLE_OPTIONS.map((option) => (
              <OptionButton
                key={option.value}
                label={option.label}
                isActive={strokeStyle === option.value}
                onClick={() => onStyleChange({ strokeStyle: option.value })}
              >
                <span
                  className="block border-current"
                  style={{
                    width: STROKE_PREVIEW_WIDTH,
                    borderTopWidth: STROKE_STYLE_PREVIEW_THICKNESS,
                    borderTopStyle: option.value,
                  }}
                />
              </OptionButton>
            ))}
          </ButtonRow>
        </Section>
      )}

      {sloppiness !== undefined && (
        <Section title="Sloppiness">
          <ButtonRow>
            {SLOPPINESS_OPTIONS.map((option) => (
              <OptionButton
                key={option.value}
                label={option.label}
                isActive={sloppiness === option.value}
                onClick={() => onStyleChange({ sloppiness: option.value })}
              >
                <FontAwesomeIcon icon={option.icon} className="w-3 h-3" />
              </OptionButton>
            ))}
          </ButtonRow>
        </Section>
      )}

      {fontFamily !== undefined && (
        <Section title="Font">
          <div className="flex items-center gap-1">
            <Dropdown
              label="Font"
              value={fontFamily}
              options={FONT_FAMILY_OPTIONS.map((option) => ({
                ...option,
                labelClassName: cn("text-[14px]", getFontFamilyClass(option.value)),
              }))}
              onChange={(value) => onStyleChange({ fontFamily: value })}
              style={{ flex: 1 }}
              buttonClassName="w-full justify-between h-8 px-2.5 rounded-md bg-surface-subtle border-transparent text-foreground hover:border-border"
              menuClassName="left-0 bg-surface-overlay border-border text-foreground"
            />
            {fontWeight !== undefined && (
              <OptionButton
                label="Bold"
                isActive={fontWeight === "bold"}
                onClick={() => onStyleChange({ fontWeight: fontWeight === "bold" ? "normal" : "bold" })}
              >
                <FontAwesomeIcon icon={faBold} className="w-3 h-3" />
              </OptionButton>
            )}
          </div>
        </Section>
      )}

      {fontSize !== undefined && (
        <Section title="Font size">
          <ButtonRow>
            {FONT_SIZE_OPTIONS.map((option) => (
              <OptionButton
                key={option.value}
                label={option.title}
                isActive={fontSize === option.value}
                onClick={() => onStyleChange({ fontSize: option.value })}
              >
                <span className="text-[11px] font-semibold">{option.label}</span>
              </OptionButton>
            ))}
          </ButtonRow>
        </Section>
      )}

      {opacity !== undefined && (
        <Section title={`Opacity · ${opacity}`}>
          <input
            type="range"
            aria-label="Opacity"
            min={0}
            max={100}
            step={OPACITY_STEP}
            value={opacity}
            onChange={(event) => onStyleChange({ opacity: Number(event.target.value) })}
            className="w-full accent-accent cursor-pointer"
          />
        </Section>
      )}

      {cardColor !== null && (
        <Section title="Card color">
          <ColorSwatches color={cardColor} swatches={cardSwatches} onChange={onCardColorChange} />
        </Section>
      )}

      {hasSelection && (
        <>
          <Section title="Layers">
            <ButtonRow>
              <OptionButton label="Send to back (Ctrl+Shift+[)" onClick={onSendToBack}>
                <FontAwesomeIcon icon={faAnglesDown} className="w-3 h-3" />
              </OptionButton>
              <OptionButton label="Send backward (Ctrl+[)" onClick={onSendBackward}>
                <FontAwesomeIcon icon={faAngleDown} className="w-3 h-3" />
              </OptionButton>
              <OptionButton label="Bring forward (Ctrl+])" onClick={onBringForward}>
                <FontAwesomeIcon icon={faAngleUp} className="w-3 h-3" />
              </OptionButton>
              <OptionButton label="Bring to front (Ctrl+Shift+])" onClick={onBringToFront}>
                <FontAwesomeIcon icon={faAnglesUp} className="w-3 h-3" />
              </OptionButton>
            </ButtonRow>
          </Section>
          <Section title="Actions">
            <ButtonRow>
              <OptionButton label="Duplicate (Ctrl+D)" onClick={onDuplicate}>
                <FontAwesomeIcon icon={faCopy} className="w-3 h-3" />
              </OptionButton>
              <OptionButton label="Delete (Del)" onClick={onDelete}>
                <FontAwesomeIcon icon={faTrashCan} className="w-3 h-3" />
              </OptionButton>
            </ButtonRow>
          </Section>
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">{title}</span>
      {children}
    </div>
  );
}

function ButtonRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-1">{children}</div>;
}

function OptionButton({
  label,
  isActive = false,
  onClick,
  children,
}: {
  label: string;
  isActive?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={isActive}
      className={cn(
        "w-8 h-8 flex items-center justify-center rounded-md border cursor-pointer transition-colors",
        isActive
          ? "bg-accent/20 border-accent text-foreground"
          : "bg-surface-subtle border-transparent text-foreground-muted hover:text-foreground hover:border-border",
      )}
    >
      {children}
    </button>
  );
}
