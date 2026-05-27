/**
 * firebase-course-service.js - שירות ניהול קורסים ומשתמשים (Firebase)
 * ====================================================================
 * קובץ זה הוא שכבת השירות המרכזית של האתר.
 * הוא מספק את כל פונקציות ה-CRUD (יצירה, קריאה, עדכון, מחיקה)
 * עבור קורסים, וכן פונקציות מעקב (Follow/Unfollow) ודירוג מרצים.
 *
 * כל הפונקציות עובדות מול Firebase Firestore ומשתמשות
 * ב-window.db שמאותחל על ידי auth.js.
 *
 * אוספי Firestore בשימוש:
 * - courses   → כל הקורסים
 * - users     → משתמשים (כולל מרצים)
 * - reviews   → ביקורות על קורסים
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
  deleteDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  increment,
  where,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

/* ================================================================
   חלק 1: ניהול קורסים (CRUD)
   ================================================================ */

/**
 * createCourse - יצירת קורס חדש ב-Firestore
 * מוסיף שדות ברירת מחדל (תאריך יצירה, מערך פרקים ריק).
 *
 * @param {Object} courseData - אובייקט עם נתוני הקורס (כותרת, תיאור, מחבר, וכו')
 * @returns {Promise<string>} מזהה המסמך החדש שנוצר
 * @throws {Error} אם ה-DB לא אותחל
 */
export async function createCourse(courseData) {
  if (!window.db) throw new Error("מסד הנתונים לא אותחל");

  /* הוספת שדות ברירת מחדל */
  const dataToSave = {
    ...courseData,
    createdAt: new Date(),
    sections: courseData.sections || [], // מערך פרקים: [{ title, content, videoUrl }]
  };

  const docRef = await addDoc(collection(window.db, "courses"), dataToSave);
  return docRef.id;
}

/**
 * getAllCourses - שליפת כל הקורסים ממוינים מהחדש לישן
 * הפונקציה גם מעשירה כל קורס בפרטי המרצה העדכניים (שם + תמונה)
 * מאוסף users, כדי שהמידע תמיד יהיה מעודכן גם אם המרצה שינה פרופיל.
 *
 * @returns {Promise<Array>} מערך אובייקטי קורסים
 * @throws {Error} אם ה-DB לא אותחל
 */
export async function getAllCourses() {
  if (!window.db) throw new Error("מסד הנתונים לא אותחל");

  /* שליפת כל הקורסים ממוינים לפי תאריך יצירה */
  const q = query(
    collection(window.db, "courses"),
    orderBy("createdAt", "desc"),
  );
  const querySnapshot = await getDocs(q);

  const courses = querySnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  /* העשרת הקורסים בפרטי מרצה עדכניים */
  const authorCache = {}; // מטמון כדי לא לשלוף אותו מרצה פעמיים
  for (let course of courses) {
    if (course.authorId) {
      /* בדיקה אם כבר שלפנו את פרטי המרצה הזה */
      if (!authorCache[course.authorId]) {
        try {
          const authorDoc = await getDoc(
            doc(window.db, "users", course.authorId),
          );
          if (authorDoc.exists()) {
            authorCache[course.authorId] = authorDoc.data();
          } else {
            authorCache[course.authorId] = null;
          }
        } catch (e) {
          authorCache[course.authorId] = null;
        }
      }

      /* עדכון שם ותמונה של המרצה בקורס */
      const authorInfo = authorCache[course.authorId];
      if (authorInfo) {
        course.authorName = authorInfo.name || course.authorName || "מרצה";
        course.authorImage =
          authorInfo.photoURL ||
          authorInfo.image ||
          course.authorImage ||
          "https://cdn-icons-png.flaticon.com/512/149/149071.png";
      }
    }
  }

  return courses;
}

/**
 * getCourseById - שליפת קורס בודד לפי מזהה
 *
 * @param {string} courseId - מזהה הקורס ב-Firestore
 * @returns {Promise<Object>} אובייקט הקורס עם כל השדות
 * @throws {Error} אם הקורס לא נמצא או ה-DB לא אותחל
 */
export async function getCourseById(courseId) {
  if (!window.db) throw new Error("מסד הנתונים לא אותחל");

  const docRef = doc(window.db, "courses", courseId);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() };
  } else {
    throw new Error("הקורס לא נמצא");
  }
}

/**
 * updateCourse - עדכון קורס קיים (כולל פרקים, כותרת, תיאור וכו')
 *
 * @param {string} courseId - מזהה הקורס לעדכון
 * @param {Object} updatedData - אובייקט עם השדות לעדכון
 * @returns {Promise<boolean>} true אם העדכון הצליח
 * @throws {Error} אם העדכון נכשל
 */
export async function updateCourse(courseId, updatedData) {
  try {
    const courseRef = doc(window.db, "courses", courseId);
    await updateDoc(courseRef, updatedData);
    console.log("הקורס עודכן בהצלחה!");
    return true;
  } catch (error) {
    console.error("שגיאה בעדכון הקורס:", error);
    throw error;
  }
}

/**
 * deleteCourse - מחיקת קורס מ-Firestore
 *
 * @param {string} courseId - מזהה הקורס למחיקה
 * @returns {Promise<boolean>} true אם המחיקה הצליחה
 * @throws {Error} אם המחיקה נכשלה
 */
export async function deleteCourse(courseId) {
  try {
    await deleteDoc(doc(window.db, "courses", courseId));
    console.log("הקורס נמחק בהצלחה!");
    return true;
  } catch (error) {
    console.error("שגיאה במחיקת הקורס:", error);
    throw error;
  }
}

/* ================================================================
   חלק 2: מערכת מעקב (Follow / Unfollow)
   ================================================================ */

/**
 * followUser - התחלת מעקב אחר מרצה
 * מבצע שתי פעולות:
 * 1. מוסיף את מזהה המרצה לרשימת followedAuthors של המשתמש
 * 2. מגדיל את מונה העוקבים (followersCount) של המרצה ב-1
 *
 * @param {string} currentUserId - מזהה המשתמש העוקב
 * @param {string} targetUserId - מזהה המרצה
 * @returns {Promise<boolean>} true אם הפעולה הצליחה
 */
export async function followUser(currentUserId, targetUserId) {
  try {
    const userRef = doc(window.db, "users", currentUserId);
    const targetRef = doc(window.db, "users", targetUserId);

    /* שלב 1: הוספת המרצה לרשימת המעקב של המשתמש (קריטי) */
    await updateDoc(userRef, {
      followedAuthors: arrayUnion(targetUserId),
    });

    /* שלב 2: הגדלת מונה העוקבים של המרצה (עשוי להיכשל בגלל הרשאות) */
    try {
      await updateDoc(targetRef, {
        followersCount: increment(1),
      });
    } catch (countError) {
      console.warn("לא ניתן לעדכן את מונה העוקבים (בעיית הרשאות?):", countError);
    }

    return true;
  } catch (error) {
    console.error("שגיאה בתחילת מעקב:", error);
    throw error;
  }
}

/**
 * unfollowUser - הפסקת מעקב אחר מרצה
 * מבצע שתי פעולות הפוכות ל-followUser:
 * 1. מסיר את מזהה המרצה מרשימת followedAuthors
 * 2. מקטין את מונה העוקבים ב-1
 *
 * @param {string} currentUserId - מזהה המשתמש
 * @param {string} targetUserId - מזהה המרצה
 * @returns {Promise<boolean>} true אם הפעולה הצליחה
 */
export async function unfollowUser(currentUserId, targetUserId) {
  try {
    const userRef = doc(window.db, "users", currentUserId);
    const targetRef = doc(window.db, "users", targetUserId);

    /* שלב 1: הסרת המרצה מרשימת המעקב */
    await updateDoc(userRef, {
      followedAuthors: arrayRemove(targetUserId),
    });

    /* שלב 2: הקטנת מונה העוקבים */
    try {
      await updateDoc(targetRef, {
        followersCount: increment(-1),
      });
    } catch (countError) {
      console.warn("לא ניתן לעדכן את מונה העוקבים:", countError);
    }

    return true;
  } catch (error) {
    console.error("שגיאה בהסרת מעקב:", error);
    throw error;
  }
}

/**
 * isUserFollowing - בדיקה האם משתמש עוקב אחרי מרצה מסוים
 *
 * @param {string} currentUserId - מזהה המשתמש הנבדק
 * @param {string} targetUserId - מזהה המרצה
 * @returns {Promise<boolean>} true אם עוקב, false אם לא
 */
export async function isUserFollowing(currentUserId, targetUserId) {
  try {
    const userRef = doc(window.db, "users", currentUserId);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const data = userSnap.data();
      return (
        data.followedAuthors && data.followedAuthors.includes(targetUserId)
      );
    }
    return false;
  } catch (error) {
    console.error("שגיאה בבדיקת סטטוס מעקב:", error);
    return false;
  }
}

/* ================================================================
   חלק 3: פונקציות עזר למשתמשים ודירוגים
   ================================================================ */

/**
 * getUserById - שליפת פרטי משתמש לפי מזהה
 *
 * @param {string} userId - מזהה המשתמש
 * @returns {Promise<Object|null>} אובייקט המשתמש, או null אם לא נמצא
 */
export async function getUserById(userId) {
  if (!userId) return null;
  try {
    const userSnap = await getDoc(doc(window.db, "users", userId));
    if (userSnap.exists()) {
      return { id: userSnap.id, ...userSnap.data() };
    }
    return null;
  } catch (error) {
    console.error("שגיאה בשליפת משתמש:", error);
    return null;
  }
}

/**
 * calculateAuthorRating - חישוב דירוג ממוצע למרצה
 * הפונקציה:
 * 1. שולפת את כל הקורסים של המרצה
 * 2. שולפת את כל הביקורות מהמערכת
 * 3. מחשבת ממוצע דירוג רק מביקורות השייכות לקורסים של המרצה
 *
 * ⚠️ הערה לאופטימיזציה: באפליקציה גדולה כדאי לחשב את זה בשרת (Cloud Functions)
 *
 * @param {string} authorId - מזהה המרצה
 * @returns {Promise<string|number>} ממוצע דירוג (למשל "4.3") או "חדש" אם אין ביקורות
 */
export async function calculateAuthorRating(authorId) {
  try {
    /* שלב 1: שליפת הקורסים של המרצה */
    const qCourses = query(
      collection(window.db, "courses"),
      where("authorId", "==", authorId),
    );
    const coursesSnap = await getDocs(qCourses);

    if (coursesSnap.empty) {
      return "חדש";
    }

    const courseIds = coursesSnap.docs.map((doc) => doc.id);
    const courseTitles = coursesSnap.docs.map((doc) => doc.data().title);

    /* שלב 2: שליפת כל הביקורות */
    const reviewsSnap = await getDocs(collection(window.db, "reviews"));

    /* שלב 3: סיכום הדירוגים מביקורות ששייכות לקורסים של המרצה */
    let totalRating = 0;
    let count = 0;

    reviewsSnap.forEach((doc) => {
      const r = doc.data();
      /* בדיקה לפי מזהה קורס או כותרת (תמיכה לאחור) */
      if (
        courseIds.includes(r.courseId) ||
        courseTitles.includes(r.courseTitle)
      ) {
        if (r.rating) {
          totalRating += r.rating;
          count++;
        }
      }
    });

    /* החזרת הממוצע מעוגל לספרה אחת, או "חדש" אם אין ביקורות */
    const result = count > 0 ? (totalRating / count).toFixed(1) : "חדש";
    return result;
  } catch (error) {
    console.error("שגיאה בחישוב דירוג מרצה:", error);
    return "N/A";
  }
}
