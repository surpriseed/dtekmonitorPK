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
  capitalize,
  deleteLastMessage,
  getCurrentTime,
  loadLastMessage,
  saveLastMessage,
} from "./helpers.js"

/* ================== UTILS ================== */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const getRandomDelay = () => {
  const min = 5 * 60 * 1000   // 5 хв
  const max = 10 * 60 * 1000  // 10 хв
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/* ================== DATA ================== */

async function getInfo() {
  console.log("🌀 Getting info...")

  const browser = await chromium.launch({ headless: true })
  const browserPage = await browser.newPage()

  try {
    await browserPage.goto(SHUTDOWNS_PAGE, { waitUntil: "load" })

    const csrfTokenTag = await browserPage.waitForSelector(
      'meta[name="csrf-token"]',
      { state: "attached" }
    )
    const csrfToken = await csrfTokenTag.getAttribute("content")

    const info = await browserPage.evaluate(
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
        return await response.json()
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
  const { sub_type, start_date, end_date, type } =
    info?.data?.[HOUSE] || {}

  return (
    sub_type !== "" ||
    start_date !== "" ||
    end_date !== "" ||
    type !== ""
  )
}

function checkIsScheduled(info) {
  const { sub_type = "" } = info?.data?.[HOUSE] || {}
  const r = sub_type.toLowerCase()

  return !r.includes("авар") && !r.includes("екст")
}

function checkIsStabilization(info) {
  const { sub_type = "" } = info?.data?.[HOUSE] || {}
  const r = sub_type.toLowerCase()

  return r.includes("стабілізац") || r.includes("графік")
}

/* ================== MESSAGES ================== */

function generateMessage(info) {
  const { sub_type = "", start_date, end_date } =
    info?.data?.[HOUSE] || {}
  const { updateTimestamp } = info || {}

  const r = sub_type.toLowerCase()

  let title = "⚡️ <b>Зафіксовано відключення</b>"

  if (r.includes("авар")) {
    title = "🔴🚨 <b>Аварійне відключення</b>"
  } else if (r.includes("екст")) {
    title = "🔥🚨 <b>Екстрене відключення</b>"
  } else if (r.includes("стабілізац") || r.includes("графік")) {
    title = "🟡🗓️ <b>Стабілізаційне відключення</b>"
  }

  return [
    title,
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

async function sendNotification(message) {
  const lastMessage = loadLastMessage() || {}

  const response = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${
      lastMessage.message_id ? "editMessageText" : "sendMessage"
    }`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "HTML",
        message_id: lastMessage.message_id ?? undefined,
      }),
    }
  )

  const data = await response.json()
  saveLastMessage(data.result)
}

/* ================== MAIN ================== */

async function run() {
  const info = await getInfo()

  const isOutage = checkIsOutage(info)
  const isScheduled = checkIsScheduled(info)
  const isStabilization = checkIsStabilization(info)

  const shouldNotify =
    isOutage && (!isScheduled || isStabilization)

  const lastMessage = loadLastMessage()

  if (shouldNotify) {
    await sendNotification(generateMessage(info))
    return
  }

  // ⏳ підтвердження відновлення
  if (!isOutage && lastMessage?.message_id) {
    const delay = getRandomDelay()
    console.log(`⏳ Waiting ${delay / 60000} min to confirm recovery...`)
    await sleep(delay)

    const recheckInfo = await getInfo()
    const stillNoOutage = !checkIsOutage(recheckInfo)

    if (stillNoOutage) {
      await sendNotification(generateRecoveryMessage(recheckInfo))
    }
  }
}

run().catch(console.error)
