import fs from "node:fs"
import path from "node:path"

import { LAST_MESSAGE_FILE } from "./constants.js"

/* ================== STRING ================== */

export function capitalize(str) {
  if (typeof str !== "string") return ""
  return str[0].toUpperCase() + str.slice(1).toLowerCase()
}

/* ================== DATE ================== */

export function getToday() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "Europe/Kyiv",
  }) // YYYY-MM-DD
}

/* ================== STORAGE ================== */

export function loadLastMessage() {
  if (!fs.existsSync(LAST_MESSAGE_FILE)) return null

  try {
    return JSON.parse(fs.readFileSync(LAST_MESSAGE_FILE, "utf8"))
  } catch (e) {
    console.error("❌ Failed to parse last message file", e)
    return null
  }
}

export function saveLastMessage({ message_id, isOutage, publishedAt } = {}) {
  fs.mkdirSync(path.dirname(LAST_MESSAGE_FILE), { recursive: true })

  fs.writeFileSync(
    LAST_MESSAGE_FILE,
    JSON.stringify(
      {
        message_id,
        isOutage,
        publishedAt: publishedAt || getToday(),
      },
      null,
      2
    )
  )
}

export function deleteLastMessage() {
  if (fs.existsSync(LAST_MESSAGE_FILE)) {
    fs.unlinkSync(LAST_MESSAGE_FILE)
  }
}

/* ================== TIME ================== */

export function getCurrentTime() {
  const now = new Date()

  const date = now.toLocaleDateString("uk-UA", {
    timeZone: "Europe/Kyiv",
  })

  const time = now.toLocaleTimeString("uk-UA", {
    timeZone: "Europe/Kyiv",
    hour: "2-digit",
    minute: "2-digit",
  })

  return `${time} ${date}`
}
