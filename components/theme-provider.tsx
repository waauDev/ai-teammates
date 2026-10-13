"use client"

import * as React from "react"

type Theme = "light" | "dark" | "system"

type ThemeContextValue = {
  setTheme: (theme: Theme) => void
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null)

function disableTransitions() {
  const style = document.createElement("style")
  style.appendChild(
    document.createTextNode(
      "*,*::before,*::after{-webkit-transition:none!important;-moz-transition:none!important;-o-transition:none!important;-ms-transition:none!important;transition:none!important}"
    )
  )
  document.head.appendChild(style)
  return () => {
    window.getComputedStyle(document.body)
    window.setTimeout(() => style.remove(), 1)
  }
}

function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "system"

  try {
    const theme = window.localStorage.getItem("theme")
    return theme === "light" || theme === "dark" || theme === "system"
      ? theme
      : "system"
  } catch {
    return "system"
  }
}

function ThemeProvider({ children }: React.PropsWithChildren) {
  const [theme, setThemeState] = React.useState<Theme>(getStoredTheme)

  const setTheme = React.useCallback((nextTheme: Theme) => {
    setThemeState(nextTheme)
    try {
      window.localStorage.setItem("theme", nextTheme)
    } catch {}
  }, [])

  React.useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const applyTheme = (nextTheme: Theme) => {
      const enableTransitions = disableTransitions()
      const resolved =
        nextTheme === "system" ? (media.matches ? "dark" : "light") : nextTheme
      const root = document.documentElement
      root.classList.remove("light", "dark")
      root.classList.add(resolved)
      root.style.colorScheme = resolved
      enableTransitions()
    }
    const handleSystemChange = () => {
      if (theme === "system") applyTheme("system")
    }
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== "theme") return
      const stored = event.newValue
      setThemeState(
        stored === "light" || stored === "dark" || stored === "system"
          ? stored
          : "system"
      )
    }

    applyTheme(theme)
    media.addEventListener("change", handleSystemChange)
    window.addEventListener("storage", handleStorage)
    return () => {
      media.removeEventListener("change", handleSystemChange)
      window.removeEventListener("storage", handleStorage)
    }
  }, [theme])

  return (
    <ThemeContext.Provider value={{ setTheme }}>
      <ThemeHotkey />
      {children}
    </ThemeContext.Provider>
  )
}

function useTheme() {
  const context = React.useContext(ThemeContext)
  if (!context) throw new Error("useTheme must be used within ThemeProvider")
  return context
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  )
}

function ThemeHotkey() {
  const { setTheme } = useTheme()

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key.toLowerCase() !== "d") return
      if (isTypingTarget(event.target)) return

      setTheme(
        document.documentElement.classList.contains("dark") ? "light" : "dark"
      )
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [setTheme])

  return null
}

export { ThemeProvider }
