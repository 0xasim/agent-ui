'use client'

import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import Icon from '@/components/ui/icon'
import { TextArea } from '@/components/ui/textarea'
import { useStore } from '@/store'
import useAIChatStreamHandler from '@/hooks/useAIStreamHandler'
import type { ToolCall } from '@/types/os'

interface FrontendToolCallProps {
  toolCall: ToolCall
}

interface FrontendToolResponder {
  sendResponse: (payload: Record<string, unknown>) => Promise<void>
  isSending: boolean
  hasResponded: boolean
  isStreaming: boolean
}

const getArg = (toolCall: ToolCall, key: string): string => {
  const value = (toolCall.tool_args as Record<string, unknown>)?.[key]
  if (value === undefined || value === null) return ''
  return typeof value === 'string' ? value : JSON.stringify(value)
}

const parseChoices = (raw: string): string[] => {
  const trimmed = raw?.trim?.() || ''
  if (!trimmed) return []

  const cleanChoice = (choice: string) => {
    let cleaned = choice.trim()
    if (cleaned.startsWith('[')) cleaned = cleaned.slice(1).trim()
    if (cleaned.endsWith(']')) cleaned = cleaned.slice(0, -1).trim()
    if (
      (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'"))
    ) {
      cleaned = cleaned.slice(1, -1).trim()
    }
    return cleaned
  }

  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed)) {
      return parsed.map((entry) => cleanChoice(String(entry))).filter(Boolean)
    }
  } catch {
    // Fallback to delimiter parsing
  }

  const newlineSplit = trimmed
    .split(/\r?\n/)
    .map((c) => cleanChoice(c))
    .filter(Boolean)
  if (trimmed.includes('\n') || newlineSplit.length > 1) {
    return newlineSplit
  }

  if (trimmed.includes('|')) {
    return trimmed
      .split('|')
      .map((c) => cleanChoice(c))
      .filter(Boolean)
  }

  if (trimmed.includes(',')) {
    return trimmed
      .split(',')
      .map((c) => cleanChoice(c))
      .filter(Boolean)
  }

  return [cleanChoice(trimmed)].filter(Boolean)
}

const parseFieldDefinitions = (raw: string) => {
  if (!raw?.trim()) return []

  return raw
    .split('|')
    .map((field) => field.trim())
    .filter(Boolean)
    .map((field) => {
      const [name, label, placeholder, type] = field.split(':')
      return {
        name: name || '',
        label: label || name || '',
        placeholder: placeholder || '',
        type: (type || 'text').toLowerCase()
      }
    })
    .filter((field) => field.name)
}

const useFrontendToolResponder = (toolCall: ToolCall): FrontendToolResponder => {
  const { handleStreamResponse } = useAIChatStreamHandler()
  const isStreaming = useStore((state) => state.isStreaming)
  const [isSending, setIsSending] = useState(false)
  const [hasResponded, setHasResponded] = useState(false)

  const sendResponse = useCallback(
    async (payload: Record<string, unknown>) => {
      if (isStreaming || isSending) return

      const messagePayload = {
        tool_call_id: toolCall.tool_call_id,
        tool_name: toolCall.tool_name,
        ...payload,
        source: 'frontend-tool'
      }

      const formattedMessage = `Tool response: ${toolCall.tool_name}\n${JSON.stringify(
        messagePayload,
        null,
        2
      )}`

      try {
        setIsSending(true)
        await handleStreamResponse(formattedMessage)
        setHasResponded(true)
      } catch (error) {
        toast.error(
          `Failed to send tool response: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        )
      } finally {
        setIsSending(false)
      }
    },
    [handleStreamResponse, isSending, isStreaming, toolCall.tool_call_id, toolCall.tool_name]
  )

  return { sendResponse, isSending, hasResponded, isStreaming }
}

const PromptUserSelection = ({ toolCall }: FrontendToolCallProps) => {
  const question =
    getArg(toolCall, 'question') || 'Please choose one of the options below'
  const choices = useMemo(
    () =>
      parseChoices(getArg(toolCall, 'choices') || getArg(toolCall, 'options')),
    [toolCall]
  )
  const { sendResponse, isSending, hasResponded, isStreaming } =
    useFrontendToolResponder(toolCall)
  const [selected, setSelected] = useState<string | null>(null)

  if (choices.length === 0) return null

  const handleSelect = async (choice: string) => {
    setSelected(choice)
    await sendResponse({
      question,
      selected: choice,
      responded_at: Date.now()
    })
  }

  return (
    <div className="w-full rounded-lg border border-border/70 bg-background/80 p-3 shadow-sm">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
        <Icon type="hammer" size="xs" />
        prompt_user_selection
      </div>
      <p className="mt-2 text-sm font-medium text-primary">{question}</p>
      <div className="mt-3 flex flex-col gap-2">
        {choices.map((choice, index) => (
          <Button
            key={`${choice}-${index}`}
            variant="outline"
            className="justify-start whitespace-normal text-left text-sm"
            disabled={isSending || hasResponded || isStreaming}
            onClick={() => handleSelect(choice)}
          >
            {choice}
          </Button>
        ))}
      </div>
      {hasResponded && selected && (
        <p className="mt-2 text-xs text-muted-foreground">
          Sent selection: <span className="font-medium">{selected}</span>
        </p>
      )}
    </div>
  )
}

const PromptUserInput = ({ toolCall }: FrontendToolCallProps) => {
  const question =
    getArg(toolCall, 'question') || 'Please provide the requested details'
  const fields = useMemo(
    () => parseFieldDefinitions(getArg(toolCall, 'fields')),
    [toolCall]
  )
  const submitLabel = getArg(toolCall, 'submit_label') || 'Submit'
  const { sendResponse, isSending, hasResponded, isStreaming } =
    useFrontendToolResponder(toolCall)
  const [values, setValues] = useState<Record<string, string>>({})

  if (fields.length === 0) return null

  const allFilled = fields.every(
    (field) => (values[field.name] || '').trim().length > 0
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!allFilled) return
    await sendResponse({
      question,
      responses: values,
      responded_at: Date.now()
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full rounded-lg border border-border/70 bg-background/80 p-3 shadow-sm"
    >
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
        <Icon type="hammer" size="xs" />
        prompt_user_input
      </div>
      <p className="mt-2 text-sm font-medium text-primary">{question}</p>

      <div className="mt-3 flex flex-col gap-3">
        {fields.map((field) => (
          <label key={field.name} className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">
              {field.label}
            </span>
            {field.type === 'textarea' ? (
              <TextArea
                value={values[field.name] || ''}
                placeholder={field.placeholder}
                onChange={(e) =>
                  setValues((prev) => ({
                    ...prev,
                    [field.name]: e.target.value
                  }))
                }
              />
            ) : (
              <input
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-0 transition focus:border-primary focus:ring-1 focus:ring-primary/30"
                value={values[field.name] || ''}
                onChange={(e) =>
                  setValues((prev) => ({
                    ...prev,
                    [field.name]: e.target.value
                  }))
                }
                placeholder={field.placeholder}
                type={field.type}
                required
              />
            )}
          </label>
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        <Button
          type="submit"
          size="sm"
          disabled={isSending || hasResponded || !allFilled || isStreaming}
        >
          {submitLabel}
        </Button>
      </div>
      {hasResponded && (
        <p className="mt-2 text-xs text-muted-foreground">
          Response sent to the agent
        </p>
      )}
    </form>
  )
}

const DefaultToolCall = ({ toolCall }: FrontendToolCallProps) => (
  <div className="flex items-center gap-2">
    <Icon type="hammer" size="xs" />
    <div className="rounded-full bg-muted/20 px-3 py-1.5 text-xs">
      <p className="font-dmmono uppercase">
        {toolCall.tool_name || 'tool'}
      </p>
    </div>
  </div>
)

const FrontendToolCall = ({ toolCall }: FrontendToolCallProps) => {
  const normalizedName = (toolCall.tool_name || '').toLowerCase()

  if (normalizedName === 'prompt_user_selection') {
    return <PromptUserSelection toolCall={toolCall} />
  }

  if (normalizedName === 'prompt_user_input') {
    return <PromptUserInput toolCall={toolCall} />
  }

  return <DefaultToolCall toolCall={toolCall} />
}

export default FrontendToolCall
