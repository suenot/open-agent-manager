import { useEffect, useRef, useState, useMemo } from "react";
import {
    DndContext,
    closestCorners,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay,
    defaultDropAnimationSideEffects,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useStore, getTasksForProject } from "../../stores/store";
import type { TaskCard, TaskStatus } from "../../types";

interface SortableTaskCardProps {
    card: TaskCard;
    editingId: string | null;
    editTitle: string;
    editDescription: string;
    onEditTitleChange: (v: string) => void;
    onEditDescriptionChange: (v: string) => void;
    onSave: () => void;
    onCancel: () => void;
    onRemove: () => void;
    onStartEdit: () => void;
}

function TaskCardItem({
    card,
    editingId,
    editTitle,
    editDescription,
    onEditTitleChange,
    onEditDescriptionChange,
    onSave,
    onCancel,
    onRemove,
    onStartEdit,
    isOverlay = false,
    dragHandleProps = {},
    style = {},
    innerRef,
}: SortableTaskCardProps & { isOverlay?: boolean; dragHandleProps?: any; style?: any; innerRef?: any }) {
    const isEditing = editingId === card.id;

    if (isEditing) {
        return (
            <div ref={innerRef} style={style} className="bg-zinc-800 border border-blue-500/50 rounded-xl p-3 shadow-2xl animate-in fade-in zoom-in duration-200 z-10">
                <input
                    autoFocus
                    value={editTitle}
                    onChange={(e) => onEditTitleChange(e.target.value)}
                    className="w-full bg-transparent border-none focus:ring-0 text-sm font-bold text-white mb-2 p-0"
                    placeholder="Task title..."
                />
                <textarea
                    value={editDescription}
                    onChange={(e) => onEditDescriptionChange(e.target.value)}
                    className="w-full bg-transparent border-none focus:ring-0 text-xs text-zinc-400 p-0 resize-none min-h-[60px]"
                    placeholder="Description (optional)..."
                />
                <div className="flex items-center justify-end gap-2 mt-2 pt-2 border-t border-white/5">
                    <button onClick={onCancel} className="px-2 py-1 text-[10px] font-bold text-zinc-500 hover:text-zinc-300">CANCEL</button>
                    <button onClick={onSave} className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold rounded-md transition-colors">SAVE</button>
                </div>
            </div>
        );
    }

    return (
        <div
            ref={innerRef}
            style={style}
            {...dragHandleProps}
            onClick={onStartEdit}
            className={`
                group relative bg-zinc-900 border border-white/5 p-3 rounded-xl cursor-pointer
                transition-all duration-300 hover:border-zinc-700 hover:bg-zinc-800/50 hover:shadow-lg
                ${isOverlay ? "bg-zinc-800 border-white/20 z-50 scale-105 shadow-2xi rotate-2" : ""}
            `}
        >
            <div className="flex items-start justify-between gap-2">
                <h4 className="text-sm font-bold text-zinc-200 leading-tight group-hover:text-white transition-colors">{card.title}</h4>
                <button
                    onClick={(e) => { e.stopPropagation(); onRemove(); }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-zinc-600 hover:text-red-400 hover:bg-red-400/10 transition-all"
                >
                    ✕
                </button>
            </div>
            {card.description && (
                <p className="text-[11px] text-zinc-500 mt-1.5 line-clamp-2 leading-relaxed">{card.description}</p>
            )}
            <div className="flex items-center justify-between mt-3">
                <div className="text-[10px] text-zinc-600 font-medium">#{card.id.slice(-4)}</div>
                <div className="text-[10px] text-zinc-700">{new Date(card.created_at).toLocaleDateString()}</div>
            </div>
        </div>
    );
}

function SortableTaskCard(props: SortableTaskCardProps) {
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
        <TaskCardItem
            {...props}
            innerRef={setNodeRef}
            style={style}
            dragHandleProps={{ ...attributes, ...listeners }}
        />
    );
}

interface TaskPanelProps {
    projectId: string;
}

const STATUS_CONFIG: {
    key: TaskStatus;
    label: string;
    color: string;
    bgColor: string;
    dotColor: string;
}[] = [
        {
            key: "todo",
            label: "To Do",
            color: "text-blue-400",
            bgColor: "bg-blue-500/10",
            dotColor: "bg-blue-400",
        },
        {
            key: "in_progress",
            label: "In Progress",
            color: "text-amber-400",
            bgColor: "bg-amber-500/10",
            dotColor: "bg-amber-400",
        },
        {
            key: "done",
            label: "Done",
            color: "text-emerald-400",
            bgColor: "bg-emerald-500/10",
            dotColor: "bg-emerald-400",
        },
    ];

export function TaskPanel({ projectId }: TaskPanelProps) {
    const tasks = useStore((s) => getTasksForProject(s, projectId));
    const loadTasks = useStore((s) => s.loadTasks);
    const addTask = useStore((s) => s.addTask);
    const removeTask = useStore((s) => s.removeTask);
    const updateTask = useStore((s) => s.updateTask);
    const reorderTasks = useStore((s) => s.reorderTasks);

    const [newTaskTitle, setNewTaskTitle] = useState("");
    const [addingInSection, setAddingInSection] = useState<TaskStatus | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState("");
    const [editDescription, setEditDescription] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        loadTasks(projectId);
    }, [projectId, loadTasks]);

    useEffect(() => {
        if (addingInSection && inputRef.current) {
            inputRef.current.focus();
        }
    }, [addingInSection]);

    const handleAdd = (status: TaskStatus) => {
        if (!newTaskTitle.trim()) return;
        const card: TaskCard = {
            id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            title: newTaskTitle.trim(),
            description: "",
            status,
            created_at: Date.now(),
        };
        addTask(projectId, card);
        setNewTaskTitle("");
        setAddingInSection(null);
    };

    const handleStatusChange = (card: TaskCard, newStatus: TaskStatus) => {
        updateTask(projectId, { ...card, status: newStatus });
    };

    const handleSaveEdit = (card: TaskCard) => {
        if (editTitle.trim()) {
            updateTask(projectId, {
                ...card,
                title: editTitle.trim(),
                description: editDescription.trim(),
            });
        }
        setEditingId(null);
    };

    const startEdit = (card: TaskCard) => {
        setEditingId(card.id);
        setEditTitle(card.title);
        setEditDescription(card.description || "");
    };

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

    const [activeId, setActiveId] = useState<string | null>(null);

    const handleDragStart = (event: any) => {
        setActiveId(event.active.id);
    };

    const handleDragOver = (event: any) => {
        const { active, over } = event;
        if (!over) return;

        const activeId = active.id;
        const overId = over.id;

        if (activeId === overId) return;

        const activeCard = tasks.find(t => t.id === activeId);
        const overCard = tasks.find(t => t.id === overId);

        // Find container for overId
        let overContainer: TaskStatus | null = null;
        if (["todo", "in_progress", "done"].includes(overId)) {
            overContainer = overId as TaskStatus;
        } else if (overCard) {
            overContainer = overCard.status;
        }

        if (!activeCard || !overContainer) return;

        if (activeCard.status !== overContainer) {
            // Move to different container
            const others = tasks.filter(t => t.id !== activeId);
            const updatedCard = { ...activeCard, status: overContainer };

            // Insert at the correct position
            const overIndex = others.findIndex(t => t.id === overId);
            const newIndex = overIndex >= 0 ? overIndex : others.length;

            others.splice(newIndex, 0, updatedCard);
            reorderTasks(projectId, others);
        }
    };

    const handleDragEnd = (event: any) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIndex = tasks.findIndex(t => t.id === active.id);
            const newIndex = tasks.findIndex(t => t.id === over.id);

            if (oldIndex !== -1 && newIndex !== -1) {
                const reordered = arrayMove(tasks, oldIndex, newIndex);
                reorderTasks(projectId, reordered);
            }
        }
        setActiveId(null);
    };

    const getTasksForStatus = (status: TaskStatus) =>
        tasks.filter((t) => t.status === status);

    const activeCardForOverlay = activeId ? (tasks.find(t => t.id === activeId) || null) : null;

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
        >
            <div className="h-full flex flex-col select-none overflow-hidden">
                <div className="flex-1 overflow-y-auto px-3 py-2 space-y-4 no-scrollbar">
                    {STATUS_CONFIG.map((section) => {
                        const sectionTasks = getTasksForStatus(section.key);

                        return (
                            <div key={section.key} id={section.key} className="rounded-lg">
                                {/* Section Header */}
                                <div className={`flex items-center justify-between px-3 py-2 rounded-t-lg ${section.bgColor}`}>
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${section.dotColor}`} />
                                        <span className={`text-xs font-semibold uppercase tracking-wider ${section.color}`}>
                                            {section.label}
                                        </span>
                                        <span className="text-[10px] text-zinc-500 font-mono">
                                            {sectionTasks.length}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setAddingInSection(section.key);
                                            setNewTaskTitle("");
                                        }}
                                        className="w-5 h-5 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors cursor-pointer"
                                        title={`Add task to ${section.label}`}
                                    >
                                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                            <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                        </svg>
                                    </button>
                                </div>

                                {/* Add Task Input */}
                                {addingInSection === section.key && (
                                    <div className="px-2 py-2 border-x border-white/5 bg-zinc-900/30">
                                        <input
                                            ref={inputRef}
                                            type="text"
                                            value={newTaskTitle}
                                            onChange={(e) => setNewTaskTitle(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") handleAdd(section.key);
                                                if (e.key === "Escape") setAddingInSection(null);
                                            }}
                                            onBlur={() => {
                                                if (newTaskTitle.trim()) handleAdd(section.key);
                                                else setAddingInSection(null);
                                            }}
                                            placeholder="Task title..."
                                            className="w-full px-3 py-2 text-sm bg-zinc-800/80 border border-white/10 rounded-lg text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
                                        />
                                    </div>
                                )}

                                {/* Cards */}
                                <div className="space-y-1 px-1 py-1 border-x border-b border-white/5 bg-zinc-900/20 rounded-b-lg min-h-[50px]">
                                    <SortableContext items={sectionTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                                        {sectionTasks.length === 0 && addingInSection !== section.key && (
                                            <div className="px-3 py-3 text-center text-[11px] text-zinc-600 italic">
                                                No tasks — drag here
                                            </div>
                                        )}
                                        {sectionTasks.map((card) => (
                                            <SortableTaskCard
                                                key={card.id}
                                                card={card}
                                                editingId={editingId}
                                                editTitle={editTitle}
                                                editDescription={editDescription}
                                                onEditTitleChange={setEditTitle}
                                                onEditDescriptionChange={setEditDescription}
                                                onSave={() => handleSaveEdit(card)}
                                                onCancel={() => setEditingId(null)}
                                                onRemove={() => removeTask(projectId, card.id)}
                                                onStartEdit={() => startEdit(card)}
                                            />
                                        ))}
                                    </SortableContext>
                                </div>
                            </div>
                        );
                    })}

                    {tasks.length === 0 && !addingInSection && (
                        <div className="flex flex-col items-center justify-center py-12 text-center opacity-40">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-3 text-zinc-500"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                            <p className="text-xs text-zinc-500">
                                No tasks yet. Click <span className="text-zinc-400">+</span> in any section to add one.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            <DragOverlay dropAnimation={{
                sideEffects: defaultDropAnimationSideEffects({
                    styles: {
                        active: {
                            opacity: '0.4',
                        },
                    },
                }),
            }}>
                {activeCardForOverlay ? (
                    <TaskCardItem
                        card={activeCardForOverlay}
                        editingId={null}
                        editTitle=""
                        editDescription=""
                        onEditTitleChange={() => { }}
                        onEditDescriptionChange={() => { }}
                        onSave={() => { }}
                        onCancel={() => { }}
                        onRemove={() => { }}
                        onStartEdit={() => { }}
                        isOverlay
                    />
                ) : null}
            </DragOverlay>
        </DndContext >
    );
}
