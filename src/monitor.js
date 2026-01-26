import { chromium } from "playwright"

import {
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  CITY,
  STREET,
  HOUSE,
  SHUTDOWNS_PAGE,
} from "./constants.js"

import {
  getCurrentTime,
  loadLastMessage,
  saveLastMessage,
} from "./helpers.js"

/* ================== UTILS ================== */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const getRandomDelay = () => {
  const min = 5 * 60 * 1000
  const max = 10 * 60 * 1000
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function buildUpdateHash(info) {
  const h = info?.data?.[HOUSE] || {}
  return JSON.stringify({
    start: h.start_date || null,
    end: h.end_date || null,
    type: h.sub_type || null,
  })
}

/* ================== DATA ================== */

async function getInfo() {
  console.log("🌀 Getting info...")

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    await page.goto(SHUTDOWNS_PAGE, { waitUntil: "load" })

    const csrfToken = await page
      .locator('meta[name="csrf-token"]')
      .getAttribute("content")

    const info = await page.evaluate(
      async ({ CITY, STREET, csrfToken }) => {
        const formData = new URLSearchParams()
        formData.append("method", "getHomeNum")
        formData.append("data[0][name]", "city")
        formData.append("data[0][value]", CITY)
        formData.append("data[1][name]", "street")
        formData.append("data[1][value]", STREET)
        formData.append("data[2][name]", "updateFact")
        formData.append("data[2][value]", new Date().toLocaleString("uk-UA"))

        const response = await fetch("/ua/ajax", {
          method: "POST",
          headers: {
            "x-requested-with": "XMLHttpRequest",
            "x-csrf-token": csrfToken,
          },
          body: formData,
        })

        return response.json()
      },
      { CITY, STREET, csrfToken }
    )

    return info
  } finally {
    await browser.close()
  }
}

/* ================== CHECKS ================== */

function checkIsOutage(info) {
  const house = info?.data?.[HOUSE]
  if (!house) return false

  const { start_date, end_date } = house

  if (!start_date && !end_date) return false

  if (end_date) {
    const end = new Date(end_date)
    if (!isNaN(end) && end < new Date()) {
      return false
    }
  }

  return true
}

function getOutageType(subType = "") {
  const r = subType.toLowerCase()

  if (r.includes("авар")) return "🔴🚨 Аварійне"
  if (r.includes("екст")) return "🔥🚨 Екстрене"
  if (r.includes("стабілізац") || r.includes("графік"))
    return "🟡🗓️ Стабілізаційне"

  return "⚡️"
}

/* ================== MESSAGES ================== */

function generateOutageMessage(info) {
  const { sub_type = "", start_date, end_date } =
    info?.data?.[HOUSE] || {}
  const { updateTimestamp } = info || {}

  const outageType = getOutageType(sub_type)

  return [
    `⚡️ <b>Зафіксовано ${outageType} відключення</b>`,
    "",
    `🪫 <b>Час початку:</b> <code>${start_date || "Невідомо"}</code>`,
    `🔌 <b>Орієнтовний час відновлення:</b> <code>${end_date || "Невідомо"}</code>`,
    "",
    `🔄 <i>Дата оновлення інформації ${updateTimestamp || "Невідомо"}</i>`,
    `💬 <i>Дата оновлення повідомлення ${getCurrentTime()}</i>`,
  ].join("\n")
}

function generateRecoveryMessage(info) {
  const { updateTimestamp } = info || {}

  return [
    "🟢💡 <b>Світлопостачання відновлено</b>",
    "",
    "⚡️ <i>Електроенергія подається у штатному режимі</i>",
    "",
    `🔄 <i>Дата оновлення інформації ${updateTimestamp || "Невідомо"}</i>`,
    `💬 <i>Дата оновлення повідомлення ${getCurrentTime()}</i>`,
  ].join("\n")
}

/* ================== TELEGRAM ================== */

async function sendNotification(message, isOutage, info) {
  const last = loadLastMessage() || {}
  const updateHash = buildUpdateHash(info)

  if (last.lastUpdateHash === updateHash && isOutage) {
    console.log("ℹ️ No changes — skipping update")
    return
  }

  const response = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${
      last.message_id ? "editMessageText" : "sendMessage"
    }`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "HTML",
        message_id: last.message_id ?? undefined,
      }),
    }
  )

  const data = await response.json()

  if (!data.ok) {
    console.error("❌ Telegram error:", data)
    return
  }

  saveLastMessage({
    message_id: data.result.message_id,
    isOutage,
    lastState: isOutage ? "OUTAGE" : "STABLE",
    lastUpdateHash: updateHash,
  })
}

/* ================== MAIN ================== */

async function run() {
  const info = await getInfo()
  const isOutage = checkIsOutage(info)
  const updateHash = buildUpdateHash(info)

  const last = loadLastMessage() || {}
  const lastState = last.lastState || "STABLE"

  console.log("DEBUG state:", { lastState, isOutage })

  // 🔴 відключення або його оновлення
  if (isOutage) {
    await sendNotification(generateOutageMessage(info), true, info)
    return
  }

  // 🟢 підтверджене відновлення
  if (lastState === "OUTAGE" && !isOutage) {
    const delay = getRandomDelay()
    console.log(`⏳ Waiting ${delay / 60000} min to confirm recovery...`)
    await sleep(delay)

    const recheck = await getInfo()
    if (!checkIsOutage(recheck)) {
      await sendNotification(generateRecoveryMessage(recheck), false, recheck)
    }
  }
}

run().catch(console.error)
