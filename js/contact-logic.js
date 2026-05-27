/**
 * contact-logic.js - לוגיקת עמוד צור קשר
 * ==========================================
 * קובץ זה מנהל את עמוד "צור קשר" (contact.html).
 *
 * תכונות:
 * 1. טופס דינמי שמשתנה לפי סוג הפנייה (כללי, באג, הצעה, החזר, מרצה)
 * 2. לשוניות (Tabs) לבחירת סוג הפנייה
 * 3. מילוי אוטומטי של שם ואימייל אם המשתמש מחובר
 * 4. שליחת הפנייה ל-Firestore (אוסף contact_messages)
 * 5. שליחת התראה אוטומטית לכל מנהלי האתר (role: "owner")
 *
 * סוגי פניות נתמכים:
 * - general    → פנייה כללית (שם, אימייל, נושא, הודעה)
 * - bug        → דיווח על באג (+ עמוד רלוונטי)
 * - suggestion → הצעה לשיפור האתר
 * - refund     → בקשת החזר כספי (+ שם הקורס)
 * - lecturer   → בקשת הצטרפות כמרצה (+ מומחיות, ניסיון, פורטפוליו)
 */

/* ---------- ייבוא תלויות ---------- */
import {
  collection,
  addDoc,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import {
  onAuthStateChanged,
  getAuth,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";

/* ================================================================
   חלק 1: הגדרת סוגי הטפסים וה-שדות שלהם
   ================================================================
   כל סוג פנייה מוגדר כאובייקט עם:
   - label: תווית בעברית
   - icon: אייקון Font Awesome
   - fields: מערך שדות (id, label, type, icon, placeholder, required, rows)
*/
const formTypes = {
  /* --- פנייה כללית --- */
  general: {
    label: "כללי",
    icon: "fas fa-envelope",
    fields: [
      { id: "contact-name", label: "שם מלא", type: "text", icon: "fas fa-user", placeholder: "איך קוראים לך?", required: true },
      { id: "contact-email", label: "אימייל", type: "email", icon: "fas fa-envelope", placeholder: "איפה לענות לך?", required: true },
      { id: "contact-subject", label: "נושא", type: "text", icon: "fas fa-pen", placeholder: "במה מדובר?" },
      { id: "contact-message", label: "הודעה", type: "textarea", icon: "fas fa-comment-dots", placeholder: "כתוב לנו כאן...", required: true, rows: 5 },
    ],
  },
  /* --- דיווח על באג --- */
  bug: {
    label: "דיווח על באג",
    icon: "fas fa-bug",
    fields: [
      { id: "contact-name", label: "שם מלא", type: "text", icon: "fas fa-user", placeholder: "השם שלך", required: true },
      { id: "contact-email", label: "אימייל", type: "email", icon: "fas fa-envelope", placeholder: "אימייל ליצירת קשר", required: true },
      { id: "contact-page", label: "עמוד רלוונטי", type: "text", icon: "fas fa-link", placeholder: "באיזה עמוד נמצא הבאג?" },
      { id: "contact-message", label: "תיאור הבאג", type: "textarea", icon: "fas fa-bug", placeholder: "תאר את הבעיה בפירוט...", required: true, rows: 5 },
    ],
  },
  /* --- הצעות לאתר --- */
  suggestion: {
    label: "הצעות לאתר",
    icon: "fas fa-lightbulb",
    fields: [
      { id: "contact-name", label: "שם מלא", type: "text", icon: "fas fa-user", placeholder: "השם שלך", required: true },
      { id: "contact-email", label: "אימייל", type: "email", icon: "fas fa-envelope", placeholder: "אימייל ליצירת קשר", required: true },
      { id: "contact-message", label: "ההצעה שלך", type: "textarea", icon: "fas fa-lightbulb", placeholder: "ספר לנו על הרעיון שלך...", required: true, rows: 5 },
    ],
  },
  /* --- בקשת החזר כספי --- */
  refund: {
    label: "החזר כספי",
    icon: "fas fa-money-bill-wave",
    fields: [
      { id: "contact-name", label: "שם מלא", type: "text", icon: "fas fa-user", placeholder: "השם שלך", required: true },
      { id: "contact-email", label: "אימייל", type: "email", icon: "fas fa-envelope", placeholder: "אימייל ליצירת קשר", required: true },
      { id: "contact-course", label: "שם הקורס", type: "text", icon: "fas fa-book", placeholder: "לאיזה קורס?", required: true },
      { id: "contact-message", label: "סיבת הבקשה", type: "textarea", icon: "fas fa-comment-dots", placeholder: "למה את/ה מבקש/ת החזר?", required: true, rows: 4 },
    ],
  },
  /* --- בקשת הצטרפות כמרצה --- */
  lecturer: {
    label: "הצטרפות כמרצה",
    icon: "fas fa-chalkboard-teacher",
    fields: [
      { id: "contact-name", label: "שם מלא", type: "text", icon: "fas fa-user", placeholder: "השם שלך", required: true },
      { id: "contact-email", label: "אימייל", type: "email", icon: "fas fa-envelope", placeholder: "אימייל ליצירת קשר", required: true },
      { id: "contact-expertise", label: "תחום מומחיות", type: "text", icon: "fas fa-star", placeholder: "באיזה תחום תרצה ללמד?", required: true },
      { id: "contact-experience", label: "ניסיון", type: "textarea", icon: "fas fa-briefcase", placeholder: "ספר על הניסיון שלך...", required: true, rows: 3 },
      { id: "contact-portfolio", label: "קישור לפורטפוליו", type: "text", icon: "fas fa-link", placeholder: "https://..." },
    ],
  },
};

/** סוג הטופס הנוכחי (ברירת מחדל: כללי) */
let currentFormType = "general";

/* ================================================================
   חלק 2: רינדור דינמי של הטופס
   ================================================================ */

/**
 * renderFormTabs - מרנדר את לשוניות בחירת סוג הפנייה
 * יוצר כפתור לכל סוג פנייה עם אייקון ותווית.
 * הלשונית הפעילה מקבלת מחלקת "active".
 */
function renderFormTabs() {
  const tabsContainer = document.getElementById("form-type-tabs");
  if (!tabsContainer) return;

  tabsContainer.innerHTML = Object.entries(formTypes)
    .map(
      ([key, config]) => `
      <button class="form-tab ${key === currentFormType ? "active" : ""}" 
              data-type="${key}" onclick="switchFormType('${key}')">
        <i class="${config.icon}"></i>
        <span>${config.label}</span>
      </button>
    `,
    )
    .join("");
}

/**
 * renderFormFields - מרנדר את שדות הטופס לפי סוג הפנייה הנוכחי
 * יוצר input או textarea לכל שדה בהגדרה.
 */
function renderFormFields() {
  const formBody = document.getElementById("contact-form-body");
  if (!formBody) return;

  const config = formTypes[currentFormType];

  formBody.innerHTML = config.fields
    .map((field) => {
      if (field.type === "textarea") {
        return `
          <div class="input-group">
            <label><i class="${field.icon}"></i> ${field.label}</label>
            <textarea id="${field.id}" rows="${field.rows || 4}" 
                      placeholder="${field.placeholder}" 
                      ${field.required ? "required" : ""}></textarea>
          </div>
        `;
      }
      return `
        <div class="input-group">
          <label><i class="${field.icon}"></i> ${field.label}</label>
          <input type="${field.type}" id="${field.id}" 
                 placeholder="${field.placeholder}" 
                 ${field.required ? "required" : ""} />
        </div>
      `;
    })
    .join("");
}

/**
 * switchFormType - מחליף את סוג הטופס המוצג
 * @param {string} type - מפתח סוג הפנייה (general/bug/suggestion/refund/lecturer)
 */
window.switchFormType = function (type) {
  currentFormType = type;
  renderFormTabs();
  renderFormFields();
};

/* ================================================================
   חלק 3: מילוי אוטומטי של פרטי משתמש מחובר
   ================================================================ */

/**
 * autoFillUserData - ממלא אוטומטית שם ואימייל אם המשתמש מחובר
 * נקראת באתחול הדף ואחרי איפוס הטופס.
 */
function autoFillUserData() {
  const auth = getAuth();
  onAuthStateChanged(auth, (user) => {
    if (user) {
      const nameField = document.getElementById("contact-name");
      const emailField = document.getElementById("contact-email");
      if (nameField && !nameField.value)
        nameField.value = user.displayName || "";
      if (emailField && !emailField.value) emailField.value = user.email || "";
    }
  });
}

/* ================================================================
   חלק 4: שליחת הטופס ל-Firebase
   ================================================================ */

/**
 * submitContactForm - מטפל בשליחת טופס צור קשר
 * @param {Event} e - אירוע ה-submit
 *
 * שלבי העבודה:
 * 1. אוסף את כל ערכי השדות מהטופס הדינמי
 * 2. שומר את הפנייה באוסף contact_messages ב-Firestore
 * 3. שולח התראה (notification) לכל מנהלי האתר
 * 4. מציג הודעת הצלחה ומאפס את הטופס
 */
async function submitContactForm(e) {
  e.preventDefault();

  const btn = document.querySelector(".btn-contact-send");
  const status = document.getElementById("form-status");

  /* עדכון ויזואלי – "שולח..." */
  btn.innerHTML = '<span>שולח...</span> <i class="fas fa-spinner fa-spin"></i>';
  btn.disabled = true;

  try {
    /* ודא שהחיבור ל-DB קיים */
    if (!window.db) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (!window.db)
        throw new Error("חיבור למסד הנתונים נכשל. נא לרענן את הדף.");
    }

    /* איסוף ערכי כל השדות */
    const config = formTypes[currentFormType];
    const data = {
      formType: currentFormType,       // סוג הפנייה (מפתח טכני)
      formTypeLabel: config.label,     // תווית הפנייה בעברית
      status: "new",                   // סטטוס: חדש (עדיין לא טופל)
      createdAt: new Date(),           // חותמת זמן
    };

    /* מילוי הנתונים מהשדות */
    config.fields.forEach((field) => {
      const el = document.getElementById(field.id);
      if (el) data[field.id.replace("contact-", "")] = el.value;
    });

    /* הוספת פרטי משתמש מחובר (אם רלוונטי) */
    const auth = getAuth();
    if (auth.currentUser) {
      data.userId = auth.currentUser.uid;
      data.userEmail = auth.currentUser.email;
      data.userName = auth.currentUser.displayName;
    }

    /* שמירה ב-Firestore */
    await addDoc(collection(window.db, "contact_messages"), data);

    /* שליחת התראה לכל מנהלי האתר */
    try {
      const { createNotification } = await import("./notification-service.js");
      const {
        getDocs,
        query,
        where,
        collection: fsColl,
      } = await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js");

      /* מציאת כל המנהלים (role === "owner") */
      const ownersQ = query(
        fsColl(window.db, "users"),
        where("role", "==", "owner"),
      );
      const ownersSnap = await getDocs(ownersQ);

      const senderName =
        data.name || (auth.currentUser ? auth.currentUser.displayName : "אורח");

      /* שליחת התראה לכל מנהל */
      const promises = [];
      ownersSnap.forEach((ownerDoc) => {
        promises.push(
          createNotification(
            ownerDoc.id,
            "ticket_received",
            { userName: senderName },
            "owner-inbox.html",
          ),
        );
      });
      await Promise.all(promises);
    } catch (notifErr) {
      console.error("שגיאה בשליחת התראה למנהלים:", notifErr);
    }

    /* הודעת הצלחה */
    status.innerHTML =
      '<p style="color: #27ae60; margin-top: 15px; font-weight: bold;"><i class="fas fa-check-circle"></i> ההודעה נשלחה בהצלחה! נחזור אליך בהקדם.</p>';
    e.target.reset();

    /* מילוי מחדש של פרטי המשתמש אחרי האיפוס */
    setTimeout(autoFillUserData, 100);
  } catch (error) {
    console.error("שגיאה בשליחת הטופס:", error);
    status.innerHTML = `<p style="color: #d63031; margin-top: 15px; font-weight: bold;"><i class="fas fa-exclamation-circle"></i> שגיאה בשליחה: ${error.message}</p>`;
  } finally {
    /* שחרור הכפתור */
    btn.innerHTML = '<span>שלח הודעה</span> <i class="fas fa-paper-plane"></i>';
    btn.disabled = false;
  }
}

/* ================================================================
   חלק 5: אתחול הדף
   ================================================================ */
document.addEventListener("DOMContentLoaded", () => {
  /* רינדור ראשוני של הלשוניות והשדות */
  renderFormTabs();
  renderFormFields();

  /* מילוי אוטומטי אחרי השהייה קצרה (כדי לתת ל-auth.js להיטען) */
  setTimeout(autoFillUserData, 600);

  /* חיבור אירוע submit לטופס */
  const form = document.getElementById("contactForm");
  if (form) {
    form.addEventListener("submit", submitContactForm);
  }
});
