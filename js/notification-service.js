/**
 * notification-service.js - שירות התראות (Notifications)
 * ======================================================
 * קובץ זה מנהל את מערכת ההתראות של האתר.
 * הוא מספק פונקציות ליצירה, שליפה, וסימון התראות כנקראו.
 *
 * ההתראות נשמרות ב-Firebase Firestore כתת-אוסף (sub-collection)
 * תחת כל משתמש: users/{userId}/notifications/{notificationId}
 *
 * סוגי התראות נתמכים:
 * - new_course     → קורס חדש הועלה
 * - course_update  → קורס קיים עודכן
 * - reply          → תגובה חדשה על תגובת המשתמש
 * - site_update    → עדכון כללי לאתר
 * - ticket_resolved → פנייה לשירות לקוחות טופלה
 * - ticket_received → פנייה חדשה התקבלה (למנהל)
 */

/* ---------- ייבוא פונקציות Firestore ---------- */
import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  query,
  orderBy,
  updateDoc,
  where,
  limit,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

/**
 * getDB - עוזר פנימי שוודא שמסד הנתונים אותחל
 * @returns {Firestore} מופע ה-Firestore
 * @throws {Error} אם window.db לא הוגדר (auth.js לא רץ עדיין)
 */
function getDB() {
  if (!window.db)
    throw new Error("מסד הנתונים לא אותחל. יש לוודא ש-auth.js רץ לפני קובץ זה.");
  return window.db;
}

/**
 * createNotification - יצירת התראה חדשה למשתמש ספציפי
 * הפונקציה בונה את טקסט ההודעה אוטומטית לפי סוג ההתראה (template).
 *
 * @param {string} targetUserId - מזהה המשתמש שיקבל את ההתראה
 * @param {string} type - סוג ההתראה (ראה רשימה למעלה)
 * @param {Object} data - אובייקט עם פרטי ההתראה:
 *   - authorName: שם המרצה (לסוג new_course)
 *   - courseName: שם הקורס (לסוגי קורס)
 *   - replierName: שם המגיב (לסוג reply)
 *   - title: כותרת (לסוג site_update)
 *   - summary: תקציר (לסוג site_update)
 *   - userName: שם המשתמש (לסוג ticket_received)
 *   - customMessage: הודעה מותאמת אישית (אופציונלי)
 * @param {string} linkUrl - כתובת URL לניווט בלחיצה על ההתראה
 */
export async function createNotification(targetUserId, type, data, linkUrl) {
  const db = getDB();

  let finalMessage = "";

  /* בניית טקסט ההודעה לפי סוג ההתראה */
  switch (type) {
    case "new_course":
      finalMessage = `קורס חדש הועלה ע"י ${data.authorName}: "${data.courseName}". ${data.customMessage || ""}`;
      break;
    case "course_update":
      finalMessage = `הקורס "${data.courseName}" עודכן! ${data.customMessage || ""}`;
      break;
    case "reply":
      finalMessage = `${data.replierName} הגיב על התגובה שלך בקורס "${data.courseName}". היכנסו כדי לקרוא!`;
      break;
    case "site_update":
      finalMessage = `עדכון חדש לאתר! ${data.title}. ${data.summary || ""}`;
      break;
    case "ticket_resolved":
      finalMessage = `פנייתך לשירות הלקוחות פוענחה וטופלה: ${data.customMessage || ""}`;
      break;
    case "ticket_received":
      finalMessage = `התקבלה פניית צור קשר חדשה ממשתמש ${data.userName}.`;
      break;
    default:
      finalMessage = data.customMessage || "התראה חדשה";
  }

  /* מבנה ההתראה שנשמר ב-Firestore */
  const notificationData = {
    type: type,
    message: finalMessage.trim(),
    link: linkUrl || "#",
    isRead: false,           // התראה חדשה – עדיין לא נקראה
    createdAt: new Date(),   // חותמת זמן ליצירה
  };

  try {
    /* שמירה ב-Firestore: users/{userId}/notifications */
    const userNotificationsRef = collection(
      db,
      "users",
      targetUserId,
      "notifications",
    );
    await addDoc(userNotificationsRef, notificationData);
  } catch (error) {
    console.error(`שגיאה ביצירת התראה למשתמש ${targetUserId}:`, error);
  }
}

/**
 * getUserNotifications - שליפת ההתראות האחרונות של משתמש
 *
 * @param {string} userId - מזהה המשתמש
 * @param {number} maxCount - כמות מקסימלית להחזרה (ברירת מחדל: 50)
 * @returns {Array} מערך אובייקטי התראות ממוינים מהחדש לישן
 */
export async function getUserNotifications(userId, maxCount = 50) {
  const db = getDB();
  try {
    const notificationsRef = collection(db, "users", userId, "notifications");
    /* שאילתה: מיון לפי תאריך יצירה (יורד), הגבלה לכמות מקסימלית */
    const q = query(
      notificationsRef,
      orderBy("createdAt", "desc"),
      limit(maxCount),
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (error) {
    console.error("שגיאה בשליפת התראות:", error);
    return [];
  }
}

/**
 * markNotificationAsRead - סימון התראה ספציפית כנקראה
 * מעדכן את השדה isRead ל-true ב-Firestore.
 *
 * @param {string} userId - מזהה המשתמש
 * @param {string} notificationId - מזהה ההתראה
 */
export async function markNotificationAsRead(userId, notificationId) {
  const db = getDB();
  try {
    const notifRef = doc(db, "users", userId, "notifications", notificationId);
    await updateDoc(notifRef, { isRead: true });
  } catch (error) {
    console.error("שגיאה בסימון התראה כנקראה:", error);
  }
}

/**
 * notifyAllUsers - שליחת התראה לכל המשתמשים באתר (Broadcast)
 * ⚠️ פעולה כבדה! משמשת רק להודעות גלובליות (למשל עדכון אתר חדש).
 * שולחת את ההתראות במקביל (Promise.all) כדי לזרז את התהליך.
 * כשל בשליחה למשתמש בודד לא עוצר את השליחה לשאר המשתמשים.
 *
 * @param {string} type - סוג ההתראה
 * @param {Object} data - נתוני ההתראה
 * @param {string} linkUrl - קישור לניווט
 */
export async function notifyAllUsers(type, data, linkUrl) {
  const db = getDB();
  try {
    const usersSnap = await getDocs(collection(db, "users"));
    /* שליחה מקבילית – כל משתמש מקבל התראה בנפרד */
    const promises = usersSnap.docs.map((userDoc) =>
      createNotification(userDoc.id, type, data, linkUrl).catch((e) =>
        console.error("שגיאה בשליחת התראה למשתמש:", userDoc.id, e),
      ),
    );
    await Promise.all(promises);
  } catch (error) {
    console.error("שגיאה בשידור התראה גלובלית:", error);
  }
}

/**
 * generateId - יצירת מזהה אקראי קצר
 * משמש ליצירת מפתחות ייחודיים לפופאפים ואלמנטים דינמיים.
 * @returns {string} מחרוזת אלפא-נומרית בת 9 תווים
 */
export function generateId() {
  return Math.random().toString(36).substr(2, 9);
}
