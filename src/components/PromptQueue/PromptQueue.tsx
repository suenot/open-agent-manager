import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis, restrictToWindowEdges } from "@dnd-kit/modifiers";
import { useStore, getPromptsForProject } from "../../stores/store";
import type { PromptCard, PromptAttachment } from "../../types";

function fileToAttachment(file: File): Promise<PromptAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: file.name,
        mime: file.type || "application/octet-stream",
        dataUrl: reader.result as string,
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function isImageMime(mime: string): boolean {
  return mime.startsWith("image/");
}

function getFileIcon(mime: string): string {
  if (mime.startsWith("image/")) return "img";
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("text") || mime.includes("json") || mime.includes("xml") || mime.includes("javascript") || mime.includes("typescript")) return "txt";
  if (mime.includes("zip") || mime.includes("tar") || mime.includes("gzip")) return "zip";
  return "file";
}

interface SortablePromptCardProps {
  card: PromptCard;
  projectId: string;
  onRemove: () => void;
  onUpdate: (card: PromptCard) => void;
  onImagePaste: (e: React.ClipboardEvent, card: PromptCard) => void;
  onRemoveImage: (card: PromptCard, imgIdx: number) => void;
  onAddFiles: (card: PromptCard, files: File[]) => void;
  onRemoveAttachment: (card: PromptCard, attIdx: number) => void;
}

function PromptCardItem({
  card,
  projectId,
  onRemove,
  onUpdate,
  onImagePaste,
  onRemoveImage,
  onAddFiles,
  onRemoveAttachment,
  isOverlay = false,
  dragHandleProps = {},
  style = {},
  innerRef,
}: SortablePromptCardProps & { isOverlay?: boolean; dragHandleProps?: any; style?: any; innerRef?: any }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isFileDragOver, setIsFileDragOver] = useState(false);

  const hasContent = !!(card.text.trim() || card.images.length > 0 || (card.attachments && card.attachments.length > 0));

  const handleNativeDragStart = (e: React.DragEvent) => {
    if (!hasContent) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData(
      "application/ccam-prompt",
      JSON.stringify({ cardId: card.id, projectId })
    );
    e.dataTransfer.effectAllowed = "move";
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsFileDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      onAddFiles(card, files);
    }
  };

  const handleFileDragOver = (e: React.DragEvent) => {
    // Only respond to file drags, not prompt card drags
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      e.stopPropagation();
      setIsFileDragOver(true);
    }
  };

  const handleFileDragLeave = (e: React.DragEvent) => {
    e.stopPropagation();
    setIsFileDragOver(false);
  };

  const attachments = card.attachments || [];

  return (
    <div
      ref={innerRef}
      style={style}
      draggable={!isOverlay && hasContent}
      onDragStart={handleNativeDragStart}
      onDrop={handleFileDrop}
      onDragOver={handleFileDragOver}
      onDragLeave={handleFileDragLeave}
      className={`
        relative p-4 bg-zinc-900/50 border rounded-xl group transition-all duration-300
        ${isOverlay ? "bg-zinc-800 border-white/20 z-50 scale-105 shadow-2xl" : "hover:border-zinc-700"}
        ${isFileDragOver ? "border-blue-500/50 bg-blue-500/5 ring-1 ring-blue-500/20" : "border-white/5"}
      `}
    >
      <div className="flex items-start gap-3">
        {/* Drag Handle — for @dnd-kit reordering within queue */}
        <div
          {...dragHandleProps}
          className="mt-2 text-zinc-600 hover:text-zinc-300 cursor-grab active:cursor-grabbing transition-colors"
          title="Drag to reorder"
        >
          ⋮⋮
        </div>

        <div className="flex-1 space-y-3">
          <textarea
            value={card.text}
            onChange={(e) => onUpdate({ ...card, text: e.target.value })}
            onPaste={(e) => onImagePaste(e, card)}
            placeholder="Type your prompt instruction or paste images..."
            className="w-full bg-transparent border-none focus:ring-0 text-sm text-zinc-300 placeholder:text-zinc-600 resize-none min-h-[40px] custom-scrollbar"
            rows={1}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = `${target.scrollHeight}px`;
            }}
          />

          {/* Pasted images (legacy) */}
          {card.images.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
              {card.images.map((img, i) => (
                <div key={i} className="relative group/img">
                  <img
                    src={img}
                    alt=""
                    className="w-16 h-16 rounded-lg object-cover border border-white/10"
                  />
                  <button
                    onClick={() => onRemoveImage(card, i)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-[10px] opacity-0 group-hover/img:opacity-100 transition-all shadow-lg border border-white/20"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* File attachments */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
              {attachments.map((att, i) => (
                <div key={att.id} className="relative group/att">
                  {isImageMime(att.mime) ? (
                    <img
                      src={att.dataUrl}
                      alt={att.name}
                      className="w-16 h-16 rounded-lg object-cover border border-white/10"
                      title={att.name}
                    />
                  ) : (
                    <div
                      className="w-16 h-16 rounded-lg border border-white/10 bg-zinc-800 flex flex-col items-center justify-center gap-1"
                      title={att.name}
                    >
                      <span className="text-[10px] font-bold text-zinc-400 uppercase">{getFileIcon(att.mime)}</span>
                      <span className="text-[8px] text-zinc-500 truncate max-w-[56px] px-1">{att.name}</span>
                    </div>
                  )}
                  <button
                    onClick={() => onRemoveAttachment(card, i)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-[10px] opacity-0 group-hover/att:opacity-100 transition-all shadow-lg border border-white/20"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Action bar: attach files + drag-to-terminal hint */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1 rounded-md hover:bg-white/5"
              title="Attach files"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
              Attach
            </button>
            {hasContent && (
              <span className="text-[10px] text-zinc-600 ml-auto">Drag to terminal</span>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length > 0) {
                onAddFiles(card, files);
              }
              // Reset input so the same file can be selected again
              e.target.value = "";
            }}
          />
        </div>

        <button
          onClick={onRemove}
          className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-400/10 transition-all opacity-0 group-hover:opacity-100"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>

      {/* File drag overlay hint */}
      {isFileDragOver && (
        <div className="absolute inset-0 rounded-xl bg-blue-500/10 border-2 border-dashed border-blue-500/40 flex items-center justify-center pointer-events-none z-10">
          <span className="text-sm font-medium text-blue-400">Drop files to attach</span>
        </div>
      )}
    </div>
  );
}

function SortablePromptCard(props: SortablePromptCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.card.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <PromptCardItem
      {...props}
      innerRef={setNodeRef}
      style={style}
      dragHandleProps={{ ...attributes, ...listeners }}
    />
  );
}

interface PromptQueueProps {
  projectId: string;
}

export function PromptQueue({ projectId }: PromptQueueProps) {
  const prompts = useStore((s) => getPromptsForProject(s, projectId));
  const loadPrompts = useStore((s) => s.loadPrompts);
  const addPrompt = useStore((s) => s.addPrompt);
  const removePrompt = useStore((s) => s.removePrompt);
  const updatePrompt = useStore((s) => s.updatePrompt);
  const reorderPrompts = useStore((s) => s.reorderPrompts);
  const setShowPromptQueue = useStore((s) => s.setShowPromptQueue);

  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    loadPrompts(projectId);
  }, [projectId, loadPrompts]);

  const handleAdd = () => {
    const card: PromptCard = {
      id: `prompt-${Date.now()}`,
      text: "",
      images: [],
      attachments: [],
    };
    addPrompt(projectId, card);
  };

  const handleImagePaste = (
    e: React.ClipboardEvent,
    card: PromptCard,
  ) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (!blob) continue;
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          updatePrompt(projectId, {
            ...card,
            images: [...card.images, dataUrl],
          });
        };
        reader.readAsDataURL(blob);
      }
    }
  };

  const handleRemoveImage = (card: PromptCard, imgIdx: number) => {
    updatePrompt(projectId, {
      ...card,
      images: card.images.filter((_, i) => i !== imgIdx),
    });
  };

  const handleAddFiles = async (card: PromptCard, files: File[]) => {
    const newAttachments: PromptAttachment[] = [];
    for (const file of files) {
      try {
        const att = await fileToAttachment(file);
        newAttachments.push(att);
      } catch (err) {
        console.error("Failed to read file:", err);
      }
    }
    if (newAttachments.length > 0) {
      updatePrompt(projectId, {
        ...card,
        attachments: [...(card.attachments || []), ...newAttachments],
      });
    }
  };

  const handleRemoveAttachment = (card: PromptCard, attIdx: number) => {
    updatePrompt(projectId, {
      ...card,
      attachments: (card.attachments || []).filter((_, i) => i !== attIdx),
    });
  };

  const handleDragStart = (event: any) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = prompts.findIndex(p => p.id === active.id);
      const newIndex = prompts.findIndex(p => p.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const reordered = arrayMove(prompts, oldIndex, newIndex);
        reorderPrompts(projectId, reordered);
      }
    }

    setActiveId(null);
  };

  const activePromptForOverlay = activeId ? (prompts.find(p => p.id === activeId) || null) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}
    >
      <div className="h-full flex flex-col bg-zinc-950/50 backdrop-blur-xl border-l border-white/5 animate-in slide-in-from-right duration-300 shadow-2xl w-80">
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-white/5 bg-zinc-950/80">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold tracking-widest text-zinc-100 uppercase">Prompt Queue</h2>
            <div className="px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[10px] font-bold text-blue-400">
              {prompts.length}
            </div>
          </div>
          <button
            onClick={() => setShowPromptQueue(false)}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 text-zinc-500 hover:text-white transition-all"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar p-3">
          <SortableContext items={prompts.map(p => p.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {prompts.map((card) => (
                <SortablePromptCard
                  key={card.id}
                  card={card}
                  projectId={projectId}
                  onRemove={() => removePrompt(projectId, card.id)}
                  onUpdate={(updated) => updatePrompt(projectId, updated)}
                  onImagePaste={handleImagePaste}
                  onRemoveImage={handleRemoveImage}
                  onAddFiles={handleAddFiles}
                  onRemoveAttachment={handleRemoveAttachment}
                />
              ))}
            </div>
          </SortableContext>

          {prompts.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 px-10 text-center opacity-40">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-4 text-zinc-500"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
              <p className="text-sm font-medium text-zinc-400">Queue is empty</p>
              <p className="text-xs text-zinc-600 mt-1">Start by adding a new prompt card below.</p>
            </div>
          )}
        </div>

        <div className="flex-shrink-0 p-4 border-t border-white/5 bg-zinc-950/80">
          <button
            onClick={handleAdd}
            className="w-full h-11 flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white text-xs font-bold rounded-xl border border-white/5 transition-all shadow-sm active:scale-[0.98]"
          >
            <span>+</span> NEW PROMPT CARD
          </button>
        </div>

        <DragOverlay dropAnimation={null}>
          {activePromptForOverlay ? (
            <PromptCardItem
              card={activePromptForOverlay}
              projectId={projectId}
              onRemove={() => { }}
              onUpdate={() => { }}
              onImagePaste={() => { }}
              onRemoveImage={() => { }}
              onAddFiles={() => { }}
              onRemoveAttachment={() => { }}
              isOverlay
            />
          ) : null}
        </DragOverlay>
      </div>
    </DndContext>
  );
}
