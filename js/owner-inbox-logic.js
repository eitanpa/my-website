/**
 * owner-inbox-logic.js - תיבת דואר נכנס למנהל האתר
 * ====================================================
 * קובץ זה מנהל את עמוד "תיבת הדואר" (owner-inbox.html)
 * שנגיש רק למשתמשים עם תפקיד "owner".
 *
 * תכונות:
 * 1. בדיקת הרשאות – רק בעל אתר יכול לגשת
 * 2. טעינת כל פניות "צור קשר" מ-Firestore
 * 3. סינון לפי סטטוס (הכל / חדש) או סוג פנייה
 * 4. סימון פנייה כ"טופלה" + שליחת התראה לפונה
 * 5. מחיקת פניות
 *
 * אוסף Firestore: contact_messages
 */

/* ---------- ייבוא תלויות ---------- */
import {
  getFirestore,
  collection,
  query,
  orderBy,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  getDoc,
  where,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";

/* ---------- אתחול ---------- */
const auth = getAuth();
let allMessages = []; // מערך כל ההודעות שנטענו

/* ================================================================
   חלק 1: בדיקת הרשאות ואתחול
   ================================================================ */

/**
 * מאזין למצב ההזדהות – אם מחובר, בודק תפקיד.
 * אם לא מחובר – מפנה לדף ההתחברות.
 */
onAuthStateChanged(auth, async (user) => {
  if (user) {
    await checkOwnerRole(user);
  } else {
    window.location.href = "auth.html";
  }
});

/**
 * checkOwnerRole - בודק שלמשתמש יש תפקיד "owner"
 * @param {Object} user - אובייקט המשתמש מ-Firebase Auth
 *
 * אם אין הרשאה – מפנה לדף הבית עם התראה.
 * אם יש הרשאה – טוען את ההודעות.
 */
async function checkOwnerRole(user) {
  /* ודא שה-DB מוכן */
  if (!window.db) {
    setTimeout(() => checkOwnerRole(user), 500);
    return;
  }

  try {
    const userDoc = await getDoc(doc(window.db, "users", user.uid));
    if (userDoc.exists() && userDoc.data().role === "owner") {
      loadMessages();
    } else {
      alert("גישה נדחתה: אזור מנהלים בלבד.");
      window.location.href = "main.html";
    }
  } catch (error) {
    console.error("שגיאה בבדיקת תפקיד:", error);
    window.location.href = "main.html";
  }
}

/* ================================================================
   חלק 2: טעינת הודעות מ-Firestore
   ================================================================ */

/**
 * loadMessages - שולף את כל ההודעות מאוסף contact_messages
 * ממיין מהחדש לישן ושומר ב-allMessages.
 */
async function loadMessages() {
  const container = document.getElementById("messages-container");
  container.innerHTML =
    '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i> טוען הודעות...</div>';

  try {
    const q = query(
      collection(window.db, "contact_messages"),
      orderBy("createdAt", "desc"),
    );
    const snapshot = await getDocs(q);

    /* המרת המסמכים למערך אובייקטים עם תאריך מפורסר */
    allMessages = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate
        ? doc.data().createdAt.toDate()
        : new Date(doc.data().createdAt),
    }));

    renderMessages(allMessages);
  } catch (error) {
    console.error("שגיאה בטעינת ההודעות:", error);
    container.innerHTML = `<div class="error-msg">שגיאה בטעינת ההודעות: ${error.message}</div>`;
  }
}

/* ================================================================
   חלק 3: רינדור כרטיסיות הודעות
   ================================================================ */

/**
 * renderMessages - מרנדר רשימת הודעות לאלמנט ה-container
 * @param {Array} messages - מערך ההודעות להצגה (מסונן או מלא)
 *
 * כל כרטיסייה מציגה:
 * - תאריך, סוג פנייה (badge), שולח, תוכן ההודעה
 * - שדות נוספים לפי סוג (עמוד באג, שם קורס, מומחיות)
 * - כפתורי פעולה: "סמן טופל" ו-"מחק"
 */
function renderMessages(messages) {
  const container = document.getElementById("messages-container");

  if (messages.length === 0) {
    container.innerHTML = '<div class="loading-state">אין הודעות להצגה.</div>';
    return;
  }

  container.innerHTML = messages
    .map((msg) => {
      const isRead = msg.status === "read" || msg.status === "resolved";
      const isResolved = msg.status === "resolved";

      /* שדות נוספים לפי סוג הפנייה */
      let extraFields = "";
      if (msg.formType === "bug") {
        extraFields = `<p><strong>עמוד:</strong> ${msg.page || "לא צוין"}</p>`;
      } else if (msg.formType === "refund") {
        extraFields = `<p><strong>קורס:</strong> ${msg.course || "לא צוין"}</p>`;
      } else if (msg.formType === "lecturer") {
        extraFields = `<p><strong>מומחיות:</strong> ${msg.expertise}</p><p><strong>תיק עבודות:</strong> <a href="${msg.portfolio}" target="_blank">${msg.portfolio}</a></p>`;
      }

      /* עיצוב תאריך בעברית */
      const dateStr = new Intl.DateTimeFormat("he-IL", {
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      }).format(msg.createdAt);

      return `
      <div class="message-card ${isRead ? "status-read" : ""} ${isResolved ? "status-resolved" : ""}" id="msg-${msg.id}">
        <div class="msg-header">
          <span class="msg-date">${dateStr}</span>
          <span class="msg-type-badge">${msg.formTypeLabel || msg.formType}</span>
        </div>
        
        <div class="msg-content">
          <h3>${msg.subject || "ללא נושא"}</h3>
          <p><strong>מאת:</strong> ${msg.name} (${msg.email})</p>
          <div class="msg-details">
            ${msg.message || msg.experience}
            ${extraFields}
          </div>
        </div>

        <div class="msg-actions">
          ${!isResolved ? `<button class="action-btn btn-resolve" onclick="markResolved('${msg.id}')"><i class="fas fa-check"></i> סמן טופל</button>` : '<span style="color:green; padding:5px"><i class="fas fa-check-circle"></i> טופל</span>'}
          <button class="action-btn btn-delete" onclick="deleteMessage('${msg.id}')"><i class="fas fa-trash"></i> מחק</button>
        </div>
      </div>
    `;
    })
    .join("");
}

/* ================================================================
   חלק 4: סינון הודעות
   ================================================================ */

/**
 * filterMessages - מסנן את ההודעות לפי סטטוס או סוג
 * @param {string} filter - "all" (הכל), "new" (חדשות), או סוג פנייה (bug/refund/...)
 */
window.filterMessages = (filter) => {
  /* עדכון הכפתור הפעיל */
  document
    .querySelectorAll(".filter-btn")
    .forEach((btn) => btn.classList.remove("active"));
  event.target.classList.add("active");

  if (filter === "all") {
    renderMessages(allMessages);
  } else if (filter === "new") {
    renderMessages(allMessages.filter((m) => m.status === "new"));
  } else {
    renderMessages(allMessages.filter((m) => m.formType === filter));
  }
};

/* ================================================================
   חלק 5: פעולות על הודעות
   ================================================================ */

/**
 * markResolved - סימון הודעה כ"טופלה"
 * @param {string} id - מזהה ההודעה ב-Firestore
 *
 * התהליך:
 * 1. מציג prompt למנהל להוספת הודעה אישית (אופציונלי)
 * 2. מעדכן את הסטטוס ל-"resolved" ב-Firestore
 * 3. שולח התראת "ticket_resolved" לפונה (אם היה מחובר)
 * 4. מרנדר מחדש את הרשימה
 */
window.markResolved = async (id) => {
  try {
    const msg = allMessages.find((m) => m.id === id);
    if (!msg) return;

    /* שאלת המנהל אם רוצה לצרף הודעה אישית */
    const customMessage = prompt(
      "האם תרצה לצרף הודעה אישית לפונה? (ההודעה תשולב בתבנית ההתראה)",
      "",
    );

    /* ביטול – המנהל לחץ Cancel */
    if (customMessage === null) return;

    /* שלב 1: עדכון הסטטוס ב-Firestore */
    const docRef = doc(window.db, "contact_messages", id);
    await updateDoc(docRef, { status: "resolved" });

    /* שלב 2: שליחת התראה לפונה המקורי (אם היה מחובר) */
    if (msg.userId) {
      try {
        const { createNotification } =
          await import("./notification-service.js");
        await createNotification(
          msg.userId,
          "ticket_resolved",
          { customMessage: customMessage.trim() },
          "contact.html",
        );
      } catch (notifErr) {
        console.error("שגיאה בשליחת התראה לפונה:", notifErr);
      }
    } else {
      console.log("הפנייה הוגשה ע\"י אורח – לא נשלחה התראה.");
    }

    /* שלב 3: עדכון מקומי ורינדור מחדש */
    msg.status = "resolved";
    const el = document.getElementById(`msg-${id}`);
    if (el) el.classList.add("status-resolved");
    renderMessages(allMessages);
  } catch (error) {
    alert("שגיאה בעדכון סטטוס: " + error.message);
  }
};

/**
 * deleteMessage - מחיקת הודעה מ-Firestore ומהתצוגה
 * @param {string} id - מזהה ההודעה למחיקה
 */
window.deleteMessage = async (id) => {
  if (!confirm("האם למחוק הודעה זו?")) return;

  try {
    await deleteDoc(doc(window.db, "contact_messages", id));
    /* הסרה מהמערך המקומי */
    allMessages = allMessages.filter((m) => m.id !== id);
    renderMessages(allMessages);
  } catch (error) {
    alert("שגיאה במחיקת ההודעה: " + error.message);
  }
};
