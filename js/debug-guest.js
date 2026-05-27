/**
 * debug-guest.js - סקריפט דיבאג לבדיקת גישת אורח
 * ==================================================
 * סקריפט זה בודק האם משתמש אורח (שלא מחובר) יכול
 * לשלוף את רשימת הקורסים מ-Firebase Firestore.
 *
 * מטרתו העיקרית היא לזהות בעיות בחוקי האבטחה (Security Rules)
 * שמונעים קריאה ממשתמשים לא מאומתים.
 *
 * הערה: זהו סקריפט דיבאג – ניתן להסיר אותו בגרסת הייצור (Production).
 */

import { getAllCourses } from "./firebase-course-service.js";

/**
 * checkGuestAccess - בודק אם אפשר לשלוף קורסים ללא התחברות
 * אם הקריאה מצליחה, מדפיס את הקורסים לקונסולה.
 * אם נכשלת עם שגיאת הרשאה, מציג התראה למשתמש.
 */
async function checkGuestAccess() {
  console.log("בודק גישת אורח...");
  try {
    const courses = await getAllCourses();
    console.log("הקורסים נשלפו בהצלחה כאורח:", courses);
    if (courses.length === 0) {
      console.warn("הרשימה ריקה – יש לבדוק אם יש קורסים במסד הנתונים.");
    }
  } catch (error) {
    console.error("שליפת הקורסים כאורח נכשלה:", error);
    if (error.code === "permission-denied") {
      console.error("שגיאת הרשאה: יש לעדכן את חוקי האבטחה ב-Firestore כדי לאפשר קריאה לאורחים.");
      alert("שגיאת הרשאה: האורח אינו יכול לראות את הקורסים. נא לבדוק את חוקי האבטחה במסד הנתונים.");
    }
  }
}

/* הרצה עם השהייה של 2 שניות – כדי לוודא שה-DB אותחל לפני הקריאה */
setTimeout(checkGuestAccess, 2000);
