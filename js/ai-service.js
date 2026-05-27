/**
 * ai-service.js - שירות בינה מלאכותית (Gemini API)
 * ==================================================
 * קובץ זה מנהל את התקשורת עם Google Gemini API עבור
 * עוזר המרצה החכם המשולב בעמוד הקורס.
 *
 * תכונות:
 * - שמירת מפתח API ב-localStorage (לא מוטבע בקוד)
 * - שליחת שיחת צ'אט עם הקשר מערכת (System Instruction)
 * - יצירת תמונות באמצעות Imagen 3
 *
 * מודל טקסט: gemini-3-flash-preview
 * מודל תמונות: imagen-3.0-generate-001
 */

/* ---------- ניהול מפתח API ---------- */

/** מפתח השמירה ב-localStorage */
const API_KEY_STORAGE_KEY = "gemini_api_key_educom";

/**
 * getApiKey - מחזיר את מפתח ה-API השמור בדפדפן
 * @returns {string} מפתח ה-API, או מחרוזת ריקה אם לא הוגדר
 */
export function getApiKey() {
  return localStorage.getItem(API_KEY_STORAGE_KEY) || "";
}

/**
 * saveApiKey - שומר מפתח API חדש ב-localStorage
 * @param {string} key - מפתח ה-API לשמירה
 * @returns {boolean} true אם נשמר בהצלחה, false אם הקלט ריק
 */
export function saveApiKey(key) {
  if (key) {
    localStorage.setItem(API_KEY_STORAGE_KEY, key.trim());
    return true;
  }
  return false;
}

/**
 * removeApiKey - מוחק את מפתח ה-API מ-localStorage
 */
export function removeApiKey() {
  localStorage.removeItem(API_KEY_STORAGE_KEY);
}

/* ---------- שליחת הודעת צ'אט ---------- */

/**
 * sendChatMessage - שולח הודעות לצ'אט של Gemini ומקבל תשובה
 *
 * הפונקציה ממירה את פורמט ההודעות הפנימי שלנו לפורמט של Gemini API:
 * - הודעות "system" הופכות ל-systemInstruction (הוראה מערכתית)
 * - הודעות "assistant" הופכות ל-"model" (התפקיד של Gemini)
 * - הודעות "user" נשארות "user"
 *
 * @param {Array} messages - מערך הודעות בפורמט:
 *   [{ role: 'system'|'user'|'assistant', content: string }]
 * @returns {Promise<string>} הטקסט שהמודל החזיר
 * @throws {Error} אם מפתח API חסר, הבקשה נכשלה, או שלא התקבלה תשובה
 */
export async function sendChatMessage(messages) {
  const apiKey = getApiKey();

  if (!apiKey) {
    throw new Error("API_KEY_MISSING");
  }

  try {
    /* המרת מערך ההודעות לפורמט Gemini */
    let systemInstruction = null;  // הוראת מערכת (אם קיימת)
    const contents = [];           // מערך ההודעות לשליחה

    messages.forEach((msg) => {
      if (msg.role === "system") {
        /* הודעת מערכת – מועברת כ-systemInstruction נפרד */
        systemInstruction = { parts: [{ text: msg.content }] };
      } else {
        /* הודעות משתמש/מודל – ממופות לפורמט contents */
        const role = msg.role === "assistant" ? "model" : "user";
        contents.push({
          role: role,
          parts: [{ text: msg.content }],
        });
      }
    });

    /* בניית גוף הבקשה */
    const requestBody = {
      contents: contents,
      generationConfig: {
        temperature: 0.7, // רמת יצירתיות (0=מדויק, 1=יצירתי)
      },
    };

    /* הוספת הוראת מערכת אם קיימת */
    if (systemInstruction) {
      requestBody.systemInstruction = systemInstruction;
    }

    /* שליחת הבקשה ל-Gemini API */
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(requestBody),
      },
    );

    /* בדיקת שגיאות מהשרת */
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || "בקשת ה-API נכשלה");
    }

    /* חילוץ הטקסט מהתשובה */
    const data = await response.json();
    if (
      data.candidates &&
      data.candidates.length > 0 &&
      data.candidates[0].content &&
      data.candidates[0].content.parts.length > 0
    ) {
      return data.candidates[0].content.parts[0].text;
    } else {
      throw new Error("לא התקבלה תשובה מהמודל.");
    }
  } catch (error) {
    console.error("שגיאה בשירות AI:", error);
    throw error;
  }
}

/* ---------- יצירת תמונות ---------- */

/**
 * generateImage - יוצר תמונה באמצעות מודל Imagen 3 של Google
 * התמונה מוחזרת כ-Data URL (Base64) שאפשר להציג ישירות ב-<img>.
 *
 * @param {string} prompt - תיאור טקסטי של התמונה הרצויה
 * @returns {Promise<string>} Data URL של התמונה (פורמט JPEG)
 * @throws {Error} אם מפתח API חסר או יצירת התמונה נכשלה
 */
export async function generateImage(prompt) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API_KEY_MISSING");

  try {
    /* שליחת בקשה ל-Imagen API */
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          instances: [{ prompt: prompt }],
          parameters: {
            sampleCount: 1,  // כמות תמונות ליצירה
            outputOptions: { mimeType: "image/jpeg" },
          },
        }),
      },
    );

    /* בדיקת שגיאות */
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || "יצירת התמונה נכשלה");
    }

    /* חילוץ התמונה מהתשובה (מקודדת ב-Base64) */
    const data = await response.json();
    if (
      data.predictions &&
      data.predictions.length > 0 &&
      data.predictions[0].bytesBase64Encoded
    ) {
      /* המרה ל-Data URL שניתן להציג ב-img src */
      return `data:image/jpeg;base64,${data.predictions[0].bytesBase64Encoded}`;
    } else {
      throw new Error("לא התקבלה תמונה מהמודל.");
    }
  } catch (error) {
    console.error("שגיאה ב-Imagen:", error);
    throw error;
  }
}
