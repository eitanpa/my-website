/**
 * course-logic.js - לוגיקת עמוד הקורס הבודד
 * ==============================================
 * זהו הקובץ הגדול והמורכב ביותר באתר.
 * הוא מנהל את הדף course.html ואחראי על:
 *
 * 1. טעינת נתוני הקורס מ-Firestore
 * 2. בדיקת הרשאות גישה (אורח / סטודנט / רוכש / מרצה / מנהל)
 * 3. רינדור תוכן הקורס (פרקים, וידאו, טקסט)
 * 4. וידג'ט מרצה (פופאפ עם מעקב + דירוג)
 * 5. מערכת ביקורות מלאה (כוכבים, לייקים, תגובות, הצמדה)
 * 6. כפתורי בעלות (עריכה, מחיקה – למרצה בלבד)
 * 7. AI Context Menu – הסבר/הרחבה של טקסט שנבחר
 * 8. AI Quiz – יצירת מבחן אוטומטי לפי תוכן הפרק
 * 9. AI Sentiment – ניתוח סנטימנט של הביקורות (למרצה)
 * 10. Wishlist – הוספת/הסרת קורס מרשימת המשאלות
 * 11. Spy Scroll – סימון הפרק הנוכחי בסרגל הצד
 *
 * URL נדרש: course.html?id=XXX
 */

/* ================================================================
   ייבוא תלויות
   ================================================================ */
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  deleteDoc,
  doc,
  updateDoc,
  getDoc,
  arrayUnion,
  arrayRemove,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import {
  getCourseById,
  deleteCourse,
  getUserById,
  calculateAuthorRating,
  followUser,
  unfollowUser,
  isUserFollowing,
} from "./firebase-course-service.js";

/* ================================================================
   חלק 1: משתנים גלובליים ואתחול
   ================================================================ */

/** חילוץ מזהה הקורס מה-URL */
const urlParams = new URLSearchParams(window.location.search);
const courseId = urlParams.get("id");
/** תמיכה לאחור – אם אין ID, מנסה לחפש לפי שם */
const courseTitleLegacy = urlParams.get("name");

/** מזהה הקורס הנוכחי (משמש בכל הפונקציות) */
let currentCourseId = courseId;
/** אובייקט הקורס הנוכחי מ-Firestore */
let currentCourse = null;

/**
 * deleteCourseHandler - מחיקת הקורס הנוכחי
 * פונקציה גלובלית שזמינה מכפתור המחיקה.
 * מבקשת אישור מהמשתמש לפני המחיקה.
 */
window.deleteCourseHandler = async function () {
  if (!confirm("האם אתה בטוח שברצונך למחוק את הקורס? פעולה זו אינה הפיכה."))
    return;

  try {
    await deleteCourse(currentCourseId);
    alert("הקורס נמחק בהצלחה.");
    window.location.href = "all-courses.html";
  } catch (error) {
    alert("שגיאה במחיקת הקורס.");
  }
};

/* ================================================================
   חלק 2: פונקציית האתחול הראשית
   ================================================================ */

/**
 * initCourse - הפונקציה הראשית שמפעילה את כל הדף
 *
 * שלבי הטעינה:
 * 1. וידוא שיש מזהה קורס ב-URL
 * 2. שליפת הקורס מ-Firestore
 * 3. בדיקת הרשאות גישה
 * 4. רינדור תוכן (אם מורשה)
 * 5. טעינת וידג'ט מרצה וביקורות (תמיד)
 * 6. בדיקת בעלות (כפתורי עריכה/מחיקה)
 */
async function initCourse() {
  if (!courseId) {
    if (courseTitleLegacy) {
      document.getElementById("course-title").innerText =
        "קורס לא נמצא (ארכיון)";
      return;
    }
    document.getElementById("course-title").innerText = "לא נבחר קורס";
    return;
  }

  try {
    /* שליפת הקורס מ-Firestore */
    currentCourse = await getCourseById(courseId);

    /* עדכון כותרת הדף והדפדפן */
    document.title = "Educom - " + currentCourse.title;
    document.getElementById("course-title").innerText = currentCourse.title;

    /* בדיקת הרשאות גישה */
    const accessGranted = await checkCourseAccess(currentCourse);

    /* וידג'ט מרצה + ביקורות – מוצגים תמיד, גם אם התוכן נעול */
    if (currentCourse.authorId) {
      loadAuthorWidget(currentCourse.authorId);
    }
    loadReviews();
    checkOwnership(currentCourse);

    /* רינדור תוכן הקורס (רק אם יש גישה) */
    if (accessGranted) {
      renderCourseContent(currentCourse);
      setupSpyScroll();
    }
  } catch (error) {
    console.error("שגיאה באתחול הקורס:", error);
    document.getElementById("course-title").innerText = "שגיאה בטעינת הקורס";
    document.querySelector(".loading-spinner").innerText =
      "הקורס לא נמצא או שארעה שגיאה: " + error.message;
  } finally {
    if (window.hideLoader) {
      window.hideLoader();
    }
  }

  setupMobileSidebarToggle();
}

/* ================================================================
   חלק 3: בדיקת הרשאות גישה לקורס
   ================================================================ */

/**
 * checkCourseAccess - בודק אם למשתמש הנוכחי יש גישה לתוכן הקורס
 * @param {Object} course - אובייקט הקורס
 * @returns {boolean} true = גישה מלאה, false = תוכן חסום
 *
 * 3 מצבים אפשריים:
 * 1. אורח (לא מחובר) → חסום + כפתור "התחבר"
 * 2. מחובר ללא רכישה → חסום + כפתור "רכוש" (הדמיה)
 * 3. מחובר + רכש / מרצה / מנהל → גישה מלאה
 *
 * בנוסף, מנהלת את כפתור ה-Wishlist (רשימת משאלות)
 */
async function checkCourseAccess(course) {
  const currentUser = window.auth?.currentUser;

  /* קונטיינרים שנשלוט בהם */
  const contentWrapper = document.getElementById("course-sections-list");
  const sidebarList = document.getElementById("lessonList");

  /* --- מצב 1: אורח (לא מחובר) --- */
  if (!currentUser) {
    sidebarList.innerHTML = `<li style="padding:15px; color:#666;">יש להתחבר כדי לצפות בפרקים</li>`;
    contentWrapper.innerHTML = `
        <div class="access-denied-overlay">
           <i class="fas fa-lock lock-icon"></i>
           <h2>התוכן נעול לאורחים</h2>
           <p>כדי לצפות בקורס או לרכוש אותו, עליך להתחבר למערכת.</p>
           <div class="access-buttons">
              <button onclick="window.location.href='auth.html?redirect=' + encodeURIComponent(window.location.href)" class="btn-primary-access">התחבר / הירשם</button>
           </div>
        </div>
     `;
    return false;
  }

  /* --- שליפת נתוני המשתמש לבדיקת הרשאות --- */
  const userDocRef = doc(window.db, "users", currentUser.uid);
  const userSnap = await getDoc(userDocRef);
  let userData = {};
  if (userSnap.exists()) {
    userData = userSnap.data();
  }

  const isAuthor = currentUser.uid === course.authorId;
  const isOwner = userData.role === "owner";
  const purchasedCourses = userData.purchasedCourses || [];
  const hasPurchased = purchasedCourses.includes(course.id);
  const wishlist = userData.wishlist || [];
  const inWishlist = wishlist.includes(course.id);

  /* --- הגדרת כפתור Wishlist (רשימת משאלות) --- */
  const wishlistBtn = document.getElementById("btn-wishlist-course");
  if (wishlistBtn && !isAuthor && !isOwner) {
    wishlistBtn.style.display = "flex";
    const heartIcon = wishlistBtn.querySelector("i");

    /* מצב התחלתי */
    if (inWishlist) {
      heartIcon.classList.replace("far", "fas");
      wishlistBtn.classList.add("active");
    }

    /* לחיצה – הוספה/הסרה מ-Wishlist */
    wishlistBtn.addEventListener("click", async () => {
      const currentlyInWishlist = wishlistBtn.classList.contains("active");
      wishlistBtn.disabled = true;
      try {
        if (currentlyInWishlist) {
          await updateDoc(userDocRef, { wishlist: arrayRemove(course.id) });
          heartIcon.classList.replace("fas", "far");
          wishlistBtn.classList.remove("active");
        } else {
          await updateDoc(userDocRef, { wishlist: arrayUnion(course.id) });
          heartIcon.classList.replace("far", "fas");
          wishlistBtn.classList.add("active");
        }
      } catch (err) {
        console.error("שגיאה בעדכון Wishlist:", err);
      } finally {
        wishlistBtn.disabled = false;
      }
    });
  }

  /* --- מצב 3: משתמש מורשה (מרצה / מנהל / רוכש) --- */
  if (isAuthor || isOwner || hasPurchased) {
    return true;
  }

  /* --- מצב 2: משתמש מחובר ללא רכישה --- */
  sidebarList.innerHTML = `<li style="padding:15px; color:#666;"><i class="fas fa-shopping-cart"></i> חסום פרימיום</li>`;
  contentWrapper.innerHTML = `
     <div class="access-denied-overlay">
        <i class="fas fa-crown crown-icon"></i>
        <h2>קורס פרימיום</h2>
        <p>קורס זה דורש רכישה כדי לקבל גישה מלאה לכל השיעורים והתכנים המלאים.</p>
        <div class="access-buttons">
           <button id="btn-mock-purchase" class="btn-primary-access">רכוש קורס עכשיו (הדמיה)</button>
        </div>
     </div>
  `;

  /* הדמיית רכישה – setTimeout כדי לוודא שהכפתור כבר ב-DOM */
  setTimeout(() => {
    const purchaseBtn = document.getElementById("btn-mock-purchase");
    if (purchaseBtn) {
      purchaseBtn.addEventListener("click", async () => {
        purchaseBtn.innerText = "מעבד תשלום...";
        purchaseBtn.disabled = true;
        try {
          await updateDoc(userDocRef, {
            purchasedCourses: arrayUnion(course.id),
          });
          alert("התשלום עבר בהצלחה! הקורס זמין כעת.");
          window.location.reload();
        } catch (e) {
          console.error("שגיאה ברכישה:", e);
          alert("שגיאה בתהליך הרכישה.");
          purchaseBtn.innerText = "רכוש קורס עכשיו";
          purchaseBtn.disabled = false;
        }
      });
    }
  }, 100);

  return false;
}

/* ================================================================
   חלק 4: תפריט צד במובייל
   ================================================================ */

/**
 * setupMobileSidebarToggle - מוסיף כפתור פתיחה/סגירה לסרגל הצד במובייל
 */
function setupMobileSidebarToggle() {
  const toggleBtn = document.getElementById("mobile-lesson-toggle");
  const sidebar = document.querySelector(".course-sidebar");

  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener("click", () => {
      sidebar.classList.toggle("open");
      const isOpen = sidebar.classList.contains("open");
      toggleBtn.innerHTML = isOpen
        ? '<i class="fas fa-times"></i> הסתר רשימת שיעורים'
        : '<i class="fas fa-list"></i> הצג רשימת שיעורים';
    });
  }
}

/* ================================================================
   חלק 5: רינדור תוכן הקורס (וידאו + טקסט + פרקים)
   ================================================================ */

/**
 * renderCourseContent - מרנדר את כל הפרקים בדף
 * @param {Object} course - אובייקט הקורס
 *
 * לכל פרק:
 * - יצירת פריט בסרגל הצד (ללחיצה + גלילה)
 * - יצירת אזור תוכן ראשי (וידאו + טקסט)
 * - כפתור "בחן את עצמי (AI)" בתחתית כל פרק
 */
let currentModuleIndex = 0;

function renderCourseContent(course) {
  /* תמיכה לאחור בפורמט קורסים ישן (רק פרקים) - הופך לשלב יחיד */
  if (!course.modules && course.sections) {
    course.modules = [{ title: "כל התוכן", sections: course.sections }];
  } else if (!course.modules || course.modules.length === 0) {
    document.getElementById("course-sections-list").innerHTML = "<p>אין תוכן זמין לקורס זה עדיין.</p>";
    return;
  }

  currentModuleIndex = 0;
  
  // הוספת אזור בחירת שלב בסרגל הצידי
  const sidebarList = document.getElementById("lessonList");
  let moduleSelector = document.getElementById("moduleSelectorDropdown");
  
  if (!moduleSelector) {
    moduleSelector = document.createElement("select");
    moduleSelector.id = "moduleSelectorDropdown";
    moduleSelector.style.width = "100%";
    moduleSelector.style.padding = "8px";
    moduleSelector.style.marginBottom = "15px";
    moduleSelector.style.borderRadius = "8px";
    moduleSelector.style.border = "1px solid #1691fd";
    moduleSelector.style.backgroundColor = "#eef2f6";
    moduleSelector.style.fontWeight = "bold";
    moduleSelector.style.color = "#333";
    
    moduleSelector.addEventListener("change", (e) => {
        currentModuleIndex = parseInt(e.target.value, 10);
        renderModule(course, currentModuleIndex);
        const mainScroll = document.getElementById("main-scroll-container");
        if (mainScroll) mainScroll.scrollTo({top: 0, behavior: 'smooth'});
        window.scrollTo({top: 0, behavior: 'smooth'});
    });
    
    sidebarList.parentNode.insertBefore(moduleSelector, sidebarList);
  }
  
  // Update dropdown options
  moduleSelector.innerHTML = "";
  course.modules.forEach((mod, idx) => {
      const option = document.createElement("option");
      option.value = idx;
      option.innerText = `שלב ${idx + 1}: ${mod.title || "ללא כותרת"}`;
      moduleSelector.appendChild(option);
  });

  renderModule(course, currentModuleIndex);
}

function renderModule(course, index) {
  const mod = course.modules[index];
  const totalModules = course.modules.length;

  document.getElementById("course-title").innerText = `${course.title} - ${mod.title}`;
  document.title = "Educom - " + course.title;

  const sidebarList = document.getElementById("lessonList");
  const sectionsContainer = document.getElementById("course-sections-list");
  
  const moduleSelector = document.getElementById("moduleSelectorDropdown");
  if (moduleSelector) moduleSelector.value = index;

  // מילוי סרגל צד לשלב הנוכחי
  sidebarList.innerHTML = `<li style="padding: 10px 15px; font-weight: bold; background: #eef2f6; color:#1691fd;">${mod.title}</li>`;
  sectionsContainer.innerHTML = "";

  if (!mod.sections || mod.sections.length === 0) {
    sectionsContainer.innerHTML = "<p>השלב הנוכחי ריק מתוכן.</p>";
  } else {
    mod.sections.forEach((section, secIndex) => {
      const sectionId = "section-" + secIndex;

      /* --- פריט בסרגל הצד --- */
      const li = document.createElement("li");
      li.className = "lesson-item";
      li.innerText = section.title;
      li.dataset.target = sectionId;
      li.onclick = () => {
        document.getElementById(sectionId).scrollIntoView({ behavior: "smooth" });
      };
      sidebarList.appendChild(li);

      /* --- אזור תוכן ראשי --- */
      const sectionDiv = document.createElement("div");
      sectionDiv.id = sectionId;
      sectionDiv.className = "course-section";

      let contentHtml = "";

      /* וידאו (אם קיים) */
      if (section.videoUrl && section.videoUrl.trim() !== "") {
        contentHtml +=
          '<div class="video-frame">' +
          '<iframe src="' +
          section.videoUrl +
          '" frameborder="0" allowfullscreen loading="lazy"></iframe>' +
          "</div>";
      }

      /* תוכן כתוב (אם קיים, מוצג כהעתק של עורך Quill) */
      if (section.content && section.content.trim() !== "") {
        contentHtml +=
          '<div class="text-content ql-editor" style="padding: 0; min-height: auto;">' +
          section.content +
          "</div>";
      } else if (section.description) {
        contentHtml +=
          '<div class="text-content">' +
          "<p>" +
          section.description +
          "</p>" +
          "</div>";
      }

      sectionDiv.innerHTML =
        '<h2 class="section-title">' + section.title + "</h2>" + contentHtml;

      /* כפתור "בחן את עצמי (AI)" */
      const quizBtnContainer = document.createElement("div");
      quizBtnContainer.className = "ai-quiz-btn-wrapper";
      quizBtnContainer.innerHTML = `
        <button class="ai-quiz-trigger-btn" data-section="${secIndex}">
           <i class="fas fa-brain"></i> בחן את עצמי (AI)
        </button>
      `;
      sectionDiv.appendChild(quizBtnContainer);

      sectionsContainer.appendChild(sectionDiv);
    });
  }

  // Next / Prev Stage Buttons
  const navDiv = document.createElement('div');
  navDiv.className = 'course-stage-nav';
  
  if (index > 0) {
    const prevBtn = document.createElement('button');
    prevBtn.className = 'stage-nav-btn prev-btn';
    prevBtn.innerHTML = '<i class="fas fa-arrow-right"></i> לשלב הקודם';
    prevBtn.onclick = () => {
      currentModuleIndex--;
      renderModule(course, currentModuleIndex);
      const mainScroll = document.getElementById("main-scroll-container");
      if (mainScroll) mainScroll.scrollTo({top: 0, behavior: 'smooth'});
      window.scrollTo({top: 0, behavior: 'smooth'});
    };
    navDiv.appendChild(prevBtn);
  }

  if (index < totalModules - 1) {
    const nextBtn = document.createElement('button');
    nextBtn.className = 'stage-nav-btn';
    nextBtn.innerHTML = `לשלב הבא <i class="fas fa-arrow-left"></i>`;
    nextBtn.onclick = () => {
      currentModuleIndex++;
      renderModule(course, currentModuleIndex);
      const mainScroll = document.getElementById("main-scroll-container");
      if (mainScroll) mainScroll.scrollTo({top: 0, behavior: 'smooth'});
      window.scrollTo({top: 0, behavior: 'smooth'});
    };
    navDiv.appendChild(nextBtn);

    // Add Sidebar next button
    const sidebarNextBtn = document.createElement('button');
    sidebarNextBtn.className = 'stage-nav-btn sidebar-nav-btn';
    sidebarNextBtn.style.width = '100%';
    sidebarNextBtn.style.marginTop = '15px';
    sidebarNextBtn.style.fontSize = '0.9rem';
    sidebarNextBtn.style.padding = '8px';
    sidebarNextBtn.innerHTML = `לשלב הבא <i class="fas fa-arrow-left"></i>`;
    sidebarNextBtn.onclick = nextBtn.onclick;
    
    // Hover styling
    sidebarNextBtn.addEventListener('mouseenter', () => sidebarNextBtn.style.color = '#ffeb3b');
    sidebarNextBtn.addEventListener('mouseleave', () => sidebarNextBtn.style.color = 'white');

    sidebarList.appendChild(sidebarNextBtn);
  }

  sectionsContainer.appendChild(navDiv);

  initCodeBlocks();
  setupSpyScroll();

  /* טעינת וידג'ט מרצה */
  if (course.authorId) {
    loadAuthorWidget(course.authorId);
  }
}

function initCodeBlocks() {
  if (typeof hljs === 'undefined') return;
  document.querySelectorAll('pre.ql-syntax').forEach((block) => {
    if (block.parentElement.classList.contains('code-block-wrapper')) return;
    
    // Auto-highlight
    hljs.highlightElement(block);

    // Create wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'code-block-wrapper';
    
    const header = document.createElement('div');
    header.className = 'code-block-header';
    
    const langSpan = document.createElement('span');
    langSpan.className = 'code-block-lang';
    const highlightClasses = Array.from(block.classList);
    const langClass = highlightClasses.find(c => c.startsWith('language-'));
    langSpan.innerText = langClass ? langClass.replace('language-', '') : 'CODE';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-code-btn';
    copyBtn.innerHTML = '<i class="far fa-copy"></i> העתק קוד';
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(block.innerText);
      copyBtn.innerHTML = '<i class="fas fa-check"></i> הועתק!';
      setTimeout(() => copyBtn.innerHTML = '<i class="far fa-copy"></i> העתק קוד', 2000);
    };

    header.appendChild(langSpan);
    header.appendChild(copyBtn);

    block.parentNode.insertBefore(wrapper, block);
    wrapper.appendChild(header);
    wrapper.appendChild(block);
  });
}

/* ================================================================
   חלק 6: וידג'ט מרצה (Author Widget)
   ================================================================ */

/**
 * loadAuthorWidget - טוען ומציג פופאפ מרצה בעמוד הקורס
 * @param {string} authorId - מזהה המרצה
 *
 * כולל: תמונה, שם, ביוגרפיה (קצוצה), דירוג ממוצע,
 * כפתור מעקב/הפסקת מעקב, מונה עוקבים,
 * ולחיצה על התמונה מעבירה לפרופיל המלא.
 */
async function loadAuthorWidget(authorId) {
  const container = document.getElementById("course-author-info");
  if (!container) return;

  try {
    const author = await getUserById(authorId);
    if (!author) return;

    const rating = await calculateAuthorRating(authorId);

    const avatar =
      author.photoURL ||
      "https://cdn-icons-png.flaticon.com/512/149/149071.png";
    const name = author.name || "מרצה אורח";
    const bio = author.bio
      ? author.bio.length > 80
        ? author.bio.substring(0, 80) + "..."
        : author.bio
      : "אין מידע נוסף.";

    /* רינדור HTML של הוידג'ט */
    container.innerHTML = `
      <div class="author-widget-container">
        <div class="author-icon-wrapper" id="authorIconBtn">
          <img src="${avatar}" alt="${name}" title="לחץ לפרטים על המרצה">
          <span class="author-hint-tooltip">על המרצה</span>
        </div>
        
        <div class="glass-popup" id="authorPopup">
           <div class="popup-header">
             <img src="${avatar}" class="popup-avatar" id="popupAvatarBtn" title="מעבר לפרופיל המלא" style="cursor: pointer;">
             <div class="popup-info">
               <h4>${name}</h4>
               <div class="popup-rating">⭐ ${rating}</div>
             </div>
           </div>
           <p class="popup-bio">${bio}</p>
           <div class="popup-actions">
             <button id="popupFollowBtn" class="btn-popup-action">עקוב</button>
             <div class="popup-followers"><i class="fas fa-users"></i> <span id="popupFollowCount">${author.followersCount || 0}</span></div>
           </div>
        </div>
      </div>
    `;

    /* --- לוגיקת פתיחה/סגירה של הפופאפ --- */
    const iconBtn = document.getElementById("authorIconBtn");
    const popup = document.getElementById("authorPopup");
    const followBtn = document.getElementById("popupFollowBtn");
    const followCountSpan = document.getElementById("popupFollowCount");
    const avatarBtn = document.getElementById("popupAvatarBtn");

    /* לחיצה על אייקון המרצה – פתיחת/סגירת פופאפ */
    iconBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      popup.classList.toggle("show");
    });

    /* לחיצה על התמונה בפופאפ – מעבר לפרופיל מלא */
    avatarBtn.addEventListener("click", () => {
      window.location.href = `author-profile.html?id=${authorId}`;
    });

    /* סגירה בלחיצה מחוץ לפופאפ */
    document.addEventListener("click", (e) => {
      if (!popup.contains(e.target) && !iconBtn.contains(e.target)) {
        popup.classList.remove("show");
      }
    });

    /* --- לוגיקת מעקב --- */
    onAuthStateChanged(window.auth, async (user) => {
      if (user) {
        const isFollowing = await isUserFollowing(user.uid, authorId);
        updatePopupFollowBtn(followBtn, isFollowing);

        followBtn.onclick = async () => {
          const currentFollowing = followBtn.classList.contains("following");
          followBtn.disabled = true;
          const currentCount = parseInt(followCountSpan.innerText) || 0;

          try {
            if (currentFollowing) {
              await unfollowUser(user.uid, authorId);
              updatePopupFollowBtn(followBtn, false);
              followCountSpan.innerText = Math.max(0, currentCount - 1);
            } else {
              await followUser(user.uid, authorId);
              updatePopupFollowBtn(followBtn, true);
              followCountSpan.innerText = currentCount + 1;
            }
          } catch (err) {
            console.error("שגיאה בפעולת מעקב:", err);
            alert("שגיאה בביצוע הפעולה");
          } finally {
            followBtn.disabled = false;
          }
        };
      } else {
        followBtn.onclick = () => alert("עליך להתחבר כדי לעקוב.");
      }
    });
  } catch (e) {
    console.error("שגיאה בטעינת וידג'ט מרצה:", e);
  }
}

/**
 * updatePopupFollowBtn - מעדכן מראה כפתור מעקב בפופאפ
 * @param {HTMLElement} btn - אלמנט הכפתור
 * @param {boolean} isFollowing - האם עוקב כרגע
 */
function updatePopupFollowBtn(btn, isFollowing) {
  if (isFollowing) {
    btn.innerText = "✓ במעקב";
    btn.classList.add("following");
    btn.style.background = "#e2e6ea";
    btn.style.color = "#333";
  } else {
    btn.innerText = "+ עקוב";
    btn.classList.remove("following");
    btn.style.background = "#1691fd";
    btn.style.color = "white";
  }
}

/* ================================================================
   חלק 7: Spy Scroll – סימון פרק פעיל בסרגל הצד
   ================================================================ */

/**
 * setupSpyScroll - משתמש ב-IntersectionObserver לסימון הפרק הנראה
 * כאשר הגולש גולל והפרק נכנס לאזור הנראה – הפריט בתפריט הצד מסומן.
 */
function setupSpyScroll() {
  const navItems = document.querySelectorAll(".lesson-item");
  const sections = document.querySelectorAll(".course-section");

  const observerOptions = {
    root: null,
    rootMargin: "-20% 0px -60% 0px",
    threshold: 0,
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        /* הסרת סימון מכל הפריטים */
        navItems.forEach((item) => item.classList.remove("active"));
        /* סימון הפרק הנוכחי */
        const activeId = entry.target.id;
        const activeLink = document.querySelector(
          '.lesson-item[data-target="' + activeId + '"]',
        );
        if (activeLink) activeLink.classList.add("active");
      }
    });
  }, observerOptions);

  sections.forEach((section) => observer.observe(section));
}

/* ================================================================
   חלק 8: מערכת ביקורות (Reviews)
   ================================================================ */

/** דירוג שנבחר ע"י המשתמש (0 = לא נבחר) */
let selectedRating = 0;

/* --- בחירת כוכבים --- */
document.querySelectorAll(".rating-selector .star").forEach((star) => {
  star.addEventListener("click", (e) => {
    selectedRating = parseInt(e.target.getAttribute("data-value"));
    /* צביעת כוכבים עד הדירוג הנבחר */
    document.querySelectorAll(".rating-selector .star").forEach((s) => {
      const val = parseInt(s.getAttribute("data-value"));
      s.classList.toggle("active", val <= selectedRating);
    });
  });
});

/* --- שליחת ביקורת חדשה --- */
const submitBtn = document.getElementById("submitReviewBtn");
if (submitBtn) {
  submitBtn.onclick = async () => {
    const user = window.auth?.currentUser;
    const text = document.getElementById("reviewText").value;

    if (!user) {
      alert("עליך להתחבר כדי לכתוב ביקורת!");
      return;
    }
    if (selectedRating === 0) {
      alert("נא לבחור דירוג בכוכבים.");
      return;
    }
    if (!text.trim()) {
      alert("נא לכתוב טקסט.");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerText = "שולח...";

    try {
      /* הוספת הביקורת לאוסף reviews ב-Firestore */
      await addDoc(collection(window.db, "reviews"), {
        courseId: currentCourseId,
        courseTitle: currentCourse?.title || "Unknown",
        userId: user.uid,
        userName: user.displayName || "משתמש אנונימי",
        userAvatar:
          user.photoURL ||
          "https://cdn-icons-png.flaticon.com/512/149/149071.png",
        rating: selectedRating,
        comment: text,
        createdAt: serverTimestamp(),
      });

      /* איפוס הטופס */
      document.getElementById("reviewText").value = "";
      selectedRating = 0;
      document
        .querySelectorAll(".rating-selector .star")
        .forEach((s) => s.classList.remove("active"));
      alert("הביקורת נשלחה!");
    } catch (e) {
      console.error("שגיאה בשליחת ביקורת:", e);
      alert("שגיאה בשליחה.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> שלח ביקורת';
    }
  };
}

/**
 * loadReviews - טוען ומאזין לביקורות בזמן אמת (onSnapshot)
 * שואילתא לפי courseTitle (תמיכה לאחור) עם מיון מהחדש לישן.
 */
function loadReviews() {
  const reviewsList = document.getElementById("reviews-list");
  if (!reviewsList) return;

  if (!currentCourse || !currentCourse.title) return;

  const q = query(
    collection(window.db, "reviews"),
    where("courseTitle", "==", currentCourse.title),
    orderBy("createdAt", "desc"),
  );

  /* האזנה לשינויים בזמן אמת – כל שינוי גורם לרינדור מחדש */
  onSnapshot(q, (snapshot) => {
    renderReviews(snapshot, reviewsList);
  });
}

/* ================================================================
   חלק 9: רינדור ביקורות (HTML מלא)
   ================================================================ */

/**
 * renderReviews - מרנדר את כל הביקורות כולל:
 * - ממוצע דירוג כללי
 * - מיון (חדש/אהוב)
 * - ביקורות מוצמדות (Pinned) למעלה
 * - לייקים, דיסלייקים, הגב, מחיקה, הצמדה
 * - תגובות (replies) עם עיצוב מקונן (nested)
 *
 * @param {QuerySnapshot} snapshot - תוצאות השאילתה מ-Firestore
 * @param {HTMLElement} container - אלמנט ה-DOM להכנסת הביקורות
 */
function renderReviews(snapshot, container) {
  const currentUser = window.auth?.currentUser;
  const avgContainer = document.getElementById("average-rating");

  /* ברירת מחדל למיון */
  if (!window.currentReviewSort) {
    window.currentReviewSort = "recent";
  }

  /* --- יצירת כותרת + בורר מיון (פעם אחת בלבד) --- */
  if (!document.getElementById("reviews-controls-wrapper")) {
    const controlsWrapper = document.createElement("div");
    controlsWrapper.id = "reviews-controls-wrapper";
    controlsWrapper.innerHTML = `
          <div class="reviews-header-bar">
              <h3 style="margin: 0;">0 ביקורות</h3>
              <div class="reviews-sort-container">
                  <label for="reviewSortSelect" style="font-size: 14px; margin-left: 10px;">סדר לפי:</label>
                  <select id="reviewSortSelect" class="sort-select">
                      <option value="recent">החדש ביותר</option>
                      <option value="liked">האהוב ביותר</option>
                  </select>
              </div>
          </div>
          <div id="reviews-items-container"></div>
      `;
    container.innerHTML = "";
    container.appendChild(controlsWrapper);

    /* מאזין לשינוי מיון */
    document
      .getElementById("reviewSortSelect")
      .addEventListener("change", (e) => {
        window.currentReviewSort = e.target.value;
        renderReviews(snapshot, container);
      });
  }

  /* עדכון ערך הבורר */
  const sortSelect = document.getElementById("reviewSortSelect");
  if (sortSelect) sortSelect.value = window.currentReviewSort;

  const reviewsItemsContainer = document.getElementById(
    "reviews-items-container",
  );

  /* --- מצב ריק --- */
  if (snapshot.empty) {
    if (reviewsItemsContainer)
      reviewsItemsContainer.innerHTML =
        '<div class="no-reviews">עדיין אין ביקורות. היו הראשונים!</div>';
    if (avgContainer) avgContainer.innerHTML = "";
    const reviewsHeaderTitle = document.querySelector(".reviews-header-bar h3");
    if (reviewsHeaderTitle) reviewsHeaderTitle.innerHTML = `0 ביקורות`;
    return;
  }

  /* --- המרת snapshot למערך --- */
  const reviewsListRaw = snapshot.docs.map((doc) => ({
    id: doc.id,
    ref: doc,
    ...doc.data(),
  }));

  /* --- חישוב ממוצע דירוג --- */
  let totalStars = 0;
  reviewsListRaw.forEach((data) => {
    totalStars += data.rating;
  });
  const average = (totalStars / reviewsListRaw.length).toFixed(1);

  if (avgContainer) {
    avgContainer.innerHTML =
      '<span class="avg-number">' +
      average +
      "</span>" +
      '<span class="avg-stars">' +
      "★".repeat(Math.round(average)) +
      "</span>" +
      '<span class="total-reviews">(' +
      reviewsListRaw.length +
      " ביקורות)</span>";
  }

  /* עדכון כותרת */
  const reviewsHeaderTitle = document.querySelector(".reviews-header-bar h3");
  if (reviewsHeaderTitle)
    reviewsHeaderTitle.innerHTML = `${reviewsListRaw.length} ביקורות`;

  /* --- מיון: ביקורות מוצמדות למעלה, שאר לפי בחירה --- */
  const isInstructor =
    currentUser && currentCourse && currentUser.uid === currentCourse.authorId;

  let pinnedReviews = reviewsListRaw.filter((r) => r.pinned === true);
  let regularReviews = reviewsListRaw.filter((r) => r.pinned !== true);

  if (window.currentReviewSort === "recent") {
    /* מיון לפי תאריך (חדש קודם) */
    regularReviews.sort((a, b) => {
      const tA = a.createdAt?.seconds || 0;
      const tB = b.createdAt?.seconds || 0;
      return tB - tA;
    });
  } else if (window.currentReviewSort === "liked") {
    /* מיון לפי לייקים (הרבה קודם) */
    regularReviews.sort((a, b) => {
      const lA = a.likes ? a.likes.length : 0;
      const lB = b.likes ? b.likes.length : 0;
      if (lB !== lA) return lB - lA;
      /* שובר שוויון לפי תאריך */
      const tA = a.createdAt?.seconds || 0;
      const tB = b.createdAt?.seconds || 0;
      return tB - tA;
    });
  }

  const finalReviews = [...pinnedReviews, ...regularReviews];

  /* --- בניית HTML של הביקורות --- */
  let htmlResult = "";

  finalReviews.forEach((data) => {
    const stars = "★".repeat(data.rating) + "☆".repeat(5 - data.rating);
    const isOwner = currentUser && currentUser.uid === data.userId;

    /* מערכי לייקים, דיסלייקים, תגובות */
    const likes = data.likes || [];
    const dislikes = data.dislikes || [];
    const replies = data.replies || [];

    const hasLiked = currentUser ? likes.includes(currentUser.uid) : false;
    const hasDisliked = currentUser
      ? dislikes.includes(currentUser.uid)
      : false;

    /* כפתורי פעולה עליונים (מחיקה + הצמדה) */
    let headActions = "";
    if (isOwner || isInstructor) {
      headActions += `<div class="review-actions-head">`;

      /* כפתור הצמדה – למרצה בלבד */
      if (isInstructor) {
        headActions += `<button class="btn-review-action btn-pin" data-id="${data.id}" data-pinned="${data.pinned ? "true" : "false"}" style="margin-left: 10px; font-size: 13px;" title="${data.pinned ? "בטל הצמדה" : "הצמד בראש"}">
                   ${data.pinned ? '<i class="fas fa-thumbtack" style="color:#1691fd;"></i> מוחזק' : '<i class="fas fa-thumbtack"></i> הצמד'}
               </button>`;
      }

      /* כפתור מחיקה – לבעל הביקורת או למרצה */
      if (isOwner || isInstructor) {
        headActions += `<button class="btn-delete-review btn-action-icon" data-id="${data.id}" title="מחק ביקורת">
                  <i class="fas fa-trash-alt"></i>
               </button>`;
      }

      headActions += `</div>`;
    }

    /* תגית "הוצמד ע"י המרצה" */
    const pinBadge = data.pinned
      ? `<div class="pinned-badge"><i class="fas fa-thumbtack"></i> הוצמד ע"י המרצה</div>`
      : "";

    /* כפתורי פעולה תחתונים: לייק, דיסלייק, הגב */
    const footerActions = `
        <div class="review-footer-actions">
           <button class="btn-review-action btn-like ${hasLiked ? "active" : ""}" data-id="${data.id}">
             <i class="far fa-thumbs-up"></i> ${likes.length}
           </button>
           <button class="btn-review-action btn-dislike ${hasDisliked ? "active" : ""}" data-id="${data.id}">
             <i class="far fa-thumbs-down"></i> ${dislikes.length}
           </button>
           <button class="btn-review-action btn-reply-toggle" data-id="${data.id}">
             <i class="far fa-comment"></i> הגב
           </button>
        </div>
      `;

    /* תיבת הגב (מוסתרת בהתחלה) */
    const replyBox = `
        <div class="review-reply-box" id="reply-box-${data.id}" style="display: none;">
          <input type="text" placeholder="כתוב תגובה פומבית..." class="reply-input" id="reply-input-${data.id}">
          <button class="btn-submit-reply" data-id="${data.id}">שלח</button>
        </div>
      `;

    /* --- רינדור תגובות (replies) --- */
    let repliesHtml = "";
    if (replies.length > 0) {
      repliesHtml = `<div class="review-replies-list">`;
      let inNestedBlock = false;

      replies.forEach((reply, idx) => {
        const replyDate = reply.createdAt?.seconds
          ? new Date(reply.createdAt.seconds * 1000).toLocaleDateString("he-IL")
          : "לאחרונה";

        let textContent = reply.text || "";
        let isNested = false;

        /* בדיקה אם יש תיוג (@שם) בתחילת הטקסט */
        const tagMatch = textContent.match(/^(@[^\s]+)\s*(.*)/);
        if (tagMatch) {
          isNested = true;
          textContent = `<span class="reply-tag">${tagMatch[1]}</span> ${tagMatch[2]}`;
        }

        /* ניהול עטיפה מקוננת (nested replies) */
        if (isNested && !inNestedBlock) {
          repliesHtml += `<div class="nested-replies-thread">`;
          inNestedBlock = true;
        } else if (!isNested && inNestedBlock) {
          repliesHtml += `</div>`;
          inNestedBlock = false;
        }

        /* לייקים ודיסלייקים לתגובה */
        const rLikes = reply.likes ? reply.likes.length : 0;
        const rDislikes = reply.dislikes ? reply.dislikes.length : 0;
        let rLikedClass = "";
        let rDislikedClass = "";

        if (currentUser) {
          if (reply.likes && reply.likes.includes(currentUser.uid))
            rLikedClass = "user-voted";
          if (reply.dislikes && reply.dislikes.includes(currentUser.uid))
            rDislikedClass = "user-voted";
        }

        /* כפתור מחיקת תגובה (לבעל התגובה או למנהל) */
        let replyActionsHtml = "";
        if (
          currentUser &&
          (reply.userId === currentUser.uid || window.isUserAdmin)
        ) {
          replyActionsHtml = `<button class="btn-delete-reply" data-review-id="${data.id}" data-reply-index="${idx}" title="מחק תגובה"><i class="fas fa-trash"></i></button>`;
        }

        /* כפתורי לייק/דיסלייק לתגובה */
        let replyVoteHtml = `
            <button class="btn-reply-like ${rLikedClass}" data-review-id="${data.id}" data-reply-index="${idx}">
                <i class="fas fa-thumbs-up"></i> <span class="reply-like-count">${rLikes > 0 ? rLikes : ""}</span>
            </button>
            <button class="btn-reply-dislike ${rDislikedClass}" data-review-id="${data.id}" data-reply-index="${idx}">
                <i class="fas fa-thumbs-down"></i> <span class="reply-dislike-count">${rDislikes > 0 ? rDislikes : ""}</span>
            </button>
        `;

        repliesHtml += `
                 <div id="reply-${data.id}-${idx}" class="review-reply-item ${isNested ? "nested-reply" : ""}">
                    <img src="${reply.userAvatar || "https://cdn-icons-png.flaticon.com/512/149/149071.png"}" class="reply-avatar">
                     <div class="reply-content-box">
                         <div class="reply-header">
                            <div>
                               <span class="reply-author">${reply.userName}</span>
                               <span class="reply-date" style="margin-right: 8px;">${replyDate}</span>
                            </div>
                            <div style="display: flex; gap: 8px;">
                               ${replyActionsHtml}
                               <button class="btn-reply-to-reply" data-review-id="${data.id}" data-author="${reply.userName}"><i class="fas fa-reply"></i> הגב</button>
                            </div>
                         </div>
                         <p class="reply-text">${textContent}</p>
                         <div class="reply-footer-actions">
                            ${replyVoteHtml}
                         </div>
                     </div>
                 </div>
              `;

        /* סגירת בלוק מקונן אם זו התגובה האחרונה */
        if (inNestedBlock && idx === replies.length - 1) {
          repliesHtml += `</div>`;
        }
      });
      repliesHtml += `</div>`;
    }

    /* --- HTML ביקורת שלמה --- */
    htmlResult += `
        <div id="review-${data.id}" class="review-item ${data.pinned ? "is-pinned" : ""}">
           ${pinBadge}
           <div class="review-main-content">
             <img src="${data.userAvatar}" class="review-avatar">
             <div class="review-content" style="flex: 1;">

               <div class="review-header-flex">
                 <h5>${data.userName}</h5>
                 ${headActions}
               </div>
               <div class="review-stars-display">${stars}</div>
               <p class="review-text">${data.comment}</p>
               ${footerActions}
               ${replyBox}
               ${repliesHtml}
             </div>
           </div>
        </div>
      `;
  });

  /* הזרקת כל ה-HTML */
  if (reviewsItemsContainer) {
    reviewsItemsContainer.innerHTML = htmlResult;

    /* --- גלילה אוטומטית ל-hash ב-URL (למשל #review-xxx) --- */
    if (window.location.hash && !window.hasScrolledToHash) {
      const targetId = window.location.hash;
      setTimeout(() => {
        try {
          const targetEl = document.querySelector(targetId);
          if (targetEl) {
            targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
            /* אפקט הדגשה זמני */
            const originalBackground = targetEl.style.backgroundColor;
            targetEl.style.transition = "background-color 0.8s ease";
            targetEl.style.backgroundColor = "#eaf4ff";
            setTimeout(() => {
              targetEl.style.backgroundColor = originalBackground || "";
            }, 2500);
            window.hasScrolledToHash = true;
          }
        } catch (e) {
          console.error("שגיאה בגלילה ל-hash:", e);
        }
      }, 300);
    }
  }

  /* ================================================================
     מאזינים לכפתורי פעולה בביקורות
     ================================================================ */

  /* מחיקת ביקורת */
  reviewsItemsContainer
    .querySelectorAll(".btn-delete-review")
    .forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (confirm("בטוח שברצונך למחוק ביקורת זו?")) {
          try {
            await deleteDoc(doc(window.db, "reviews", btn.dataset.id));
          } catch (e) {
            console.error("שגיאה במחיקת ביקורת:", e);
          }
        }
      });
    });

  /* הצמדה/ביטול הצמדה (Pin) */
  reviewsItemsContainer.querySelectorAll(".btn-pin").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const reviewId = btn.dataset.id;
      const currentPinnedStatus = btn.dataset.pinned === "true";
      try {
        const reviewRef = doc(window.db, "reviews", reviewId);
        await updateDoc(reviewRef, {
          pinned: !currentPinnedStatus,
        });
      } catch (e) {
        console.error("שגיאה בהצמדת ביקורת:", e);
      }
    });
  });

  /* פתיחת תיבת "הגב" */
  reviewsItemsContainer.querySelectorAll(".btn-reply-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const reviewId = btn.dataset.id;
      const replyBoxEl = document.getElementById(`reply-box-${reviewId}`);
      if (replyBoxEl) {
        replyBoxEl.style.display =
          replyBoxEl.style.display === "none" ? "flex" : "none";
      }
    });
  });

  /* הגב לתגובה ספציפית (תיוג @שם) */
  reviewsItemsContainer
    .querySelectorAll(".btn-reply-to-reply")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const reviewId = btn.dataset.reviewId;
        const authorName = btn.dataset.author;
        const replyBoxEl = document.getElementById(`reply-box-${reviewId}`);
        const replyInput = document.getElementById(`reply-input-${reviewId}`);

        if (replyBoxEl && replyInput) {
          replyBoxEl.style.display = "flex";
          replyInput.value = `@${authorName} `;
          replyInput.focus();
        }
      });
    });

  /* שליחת תגובה (Reply) */
  reviewsItemsContainer.querySelectorAll(".btn-submit-reply").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!currentUser) {
        alert("יש להתחבר כדי להגיב.");
        return;
      }
      const reviewId = btn.dataset.id;
      const inputEl = document.getElementById(`reply-input-${reviewId}`);
      const text = inputEl ? inputEl.value.trim() : "";
      if (!text) return;

      btn.disabled = true;
      try {
        const reviewRef = doc(window.db, "reviews", reviewId);

        /* יצירת אובייקט התגובה */
        const newReply = {
          userId: currentUser.uid,
          userName: currentUser.displayName || currentUser.email.split("@")[0],
          userAvatar:
            currentUser.photoURL ||
            "https://cdn-icons-png.flaticon.com/512/149/149071.png",
          text: text,
          createdAt: new Date(),
        };

        /* הוספה למערך replies ב-Firestore */
        await updateDoc(reviewRef, {
          replies: arrayUnion(newReply),
        });

        /* --- שליחת התראה לכותב הביקורת או למשתמש שתויג --- */
        try {
          const reviewSnap = await getDoc(reviewRef);
          if (reviewSnap.exists()) {
            const reviewData = reviewSnap.data();
            let targetUserId = reviewData.userId;

            /* בדיקה אם זו תגובה מקוננת (תיוג @שם) */
            if (text.startsWith("@")) {
              const match = text.match(/^@([^\s:]+)/);
              if (match) {
                const taggedName = match[1];
                const repliesArray = reviewData.replies || [];
                /* חיפוש המשתמש שתויג בתגובות הקודמות */
                const taggedReply = [...repliesArray]
                  .reverse()
                  .find((r) => r.userName === taggedName);
                if (taggedReply && taggedReply.userId) {
                  targetUserId = taggedReply.userId;
                }
              }
            }

            /* לא שולחים התראה אם הגיב לעצמו */
            if (targetUserId !== currentUser.uid) {
              const { createNotification } =
                await import("./notification-service.js");
              const safeTextPreview =
                text.length > 30 ? text.substring(0, 30) + "..." : text;

              const newReplyIdx = reviewData.replies
                ? reviewData.replies.length - 1
                : 0;

              await createNotification(
                targetUserId,
                "reply",
                {
                  replierName: newReply.userName,
                  courseName: currentCourse.title || "הקורס",
                  customMessage: `"${safeTextPreview}"`,
                },
                `course.html?id=${currentCourse?.id || ""}#reply-${reviewId}-${newReplyIdx}`,
              );
            }
          }
        } catch (notifErr) {
          console.error("שגיאה בשליחת התראת תגובה:", notifErr);
        }

        inputEl.value = "";
        document.getElementById(`reply-box-${reviewId}`).style.display = "none";
      } catch (e) {
        console.error("שגיאה בשליחת תגובה:", e);
        alert("שגיאה בשליחת התגובה.");
      } finally {
        btn.disabled = false;
      }
    });
  });

  /* --- לייקים / דיסלייקים על ביקורות --- */
  reviewsItemsContainer.querySelectorAll(".btn-like").forEach((btn) => {
    btn.addEventListener("click", () => handleVote(btn.dataset.id, "like"));
  });

  reviewsItemsContainer.querySelectorAll(".btn-dislike").forEach((btn) => {
    btn.addEventListener("click", () => handleVote(btn.dataset.id, "dislike"));
  });

  /**
   * handleVote - ניהול לייק/דיסלייק על ביקורת
   * @param {string} reviewId - מזהה הביקורת
   * @param {string} action - "like" או "dislike"
   *
   * לוגיקה: לחיצה כפולה מבטלת, לייק מבטל דיסלייק ולהיפך.
   */
  async function handleVote(reviewId, action) {
    if (!currentUser) {
      alert("יש להתחבר כדי להצביע.");
      return;
    }
    try {
      const reviewRef = doc(window.db, "reviews", reviewId);
      const reviewSnap = await getDoc(reviewRef);
      if (!reviewSnap.exists()) return;

      let data = reviewSnap.data();
      let likes = data.likes || [];
      let dislikes = data.dislikes || [];
      const uid = currentUser.uid;

      if (action === "like") {
        if (likes.includes(uid)) {
          likes = likes.filter((id) => id !== uid);
        } else {
          likes.push(uid);
          dislikes = dislikes.filter((id) => id !== uid);
        }
      } else if (action === "dislike") {
        if (dislikes.includes(uid)) {
          dislikes = dislikes.filter((id) => id !== uid);
        } else {
          dislikes.push(uid);
          likes = likes.filter((id) => id !== uid);
        }
      }

      await updateDoc(reviewRef, { likes, dislikes });
    } catch (e) {
      console.error("שגיאה בהצבעה:", e);
    }
  }

  /* --- מחיקת תגובה (Reply) --- */
  reviewsItemsContainer.querySelectorAll(".btn-delete-reply").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("בטוח שברצונך למחוק תגובה זו?")) return;
      const reviewId = btn.dataset.reviewId;
      const replyIdx = parseInt(btn.dataset.replyIndex, 10);
      try {
        const reviewRef = doc(window.db, "reviews", reviewId);
        const reviewSnap = await getDoc(reviewRef);
        if (reviewSnap.exists()) {
          const data = reviewSnap.data();
          let replies = data.replies || [];
          if (replyIdx >= 0 && replyIdx < replies.length) {
            replies.splice(replyIdx, 1);
            await updateDoc(reviewRef, { replies });
          }
        }
      } catch (e) {
        console.error("שגיאה במחיקת תגובה:", e);
      }
    });
  });

  /* --- לייקים / דיסלייקים על תגובות (Replies) --- */
  reviewsItemsContainer
    .querySelectorAll(".btn-reply-like, .btn-reply-dislike")
    .forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!currentUser) {
          alert("יש להתחבר כדי להצביע.");
          return;
        }
        const reviewId = btn.dataset.reviewId;
        const replyIdx = parseInt(btn.dataset.replyIndex, 10);
        const isLike = btn.classList.contains("btn-reply-like");
        const uid = currentUser.uid;

        try {
          const reviewRef = doc(window.db, "reviews", reviewId);
          const reviewSnap = await getDoc(reviewRef);
          if (reviewSnap.exists()) {
            const data = reviewSnap.data();
            let replies = data.replies || [];
            if (replyIdx >= 0 && replyIdx < replies.length) {
              let reply = replies[replyIdx];
              reply.likes = reply.likes || [];
              reply.dislikes = reply.dislikes || [];

              if (isLike) {
                if (reply.likes.includes(uid)) {
                  reply.likes = reply.likes.filter((id) => id !== uid);
                } else {
                  reply.likes.push(uid);
                  reply.dislikes = reply.dislikes.filter((id) => id !== uid);
                }
              } else {
                if (reply.dislikes.includes(uid)) {
                  reply.dislikes = reply.dislikes.filter((id) => id !== uid);
                } else {
                  reply.dislikes.push(uid);
                  reply.likes = reply.likes.filter((id) => id !== uid);
                }
              }
              await updateDoc(reviewRef, { replies });
            }
          }
        } catch (e) {
          console.error("שגיאה בהצבעה על תגובה:", e);
        }
      });
    });
}

/* ================================================================
   חלק 10: הפעלת הפונקציה הראשית
   ================================================================ */
initCourse();

/* ================================================================
   חלק 11: בדיקת בעלות – כפתורי עריכה/מחיקה למרצה
   ================================================================ */

/**
 * checkOwnership - בודק אם המשתמש הוא יוצר הקורס
 * @param {Object} course - אובייקט הקורס
 *
 * אם כן – מוסיף כפתורי "ערוך קורס" ו-"מחק קורס" בכותרת.
 */
function checkOwnership(course) {
  if (!window.auth) return;

  onAuthStateChanged(window.auth, (user) => {
    if (user && course.authorId === user.uid) {
      const header = document.querySelector(".course-header");
      if (header) {
        const controlsDiv = document.createElement("div");
        controlsDiv.className = "owner-controls";

        /* כפתור עריכה */
        const editBtn = document.createElement("button");
        editBtn.className = "btn-edit";
        editBtn.innerHTML = '<i class="fas fa-edit"></i> ערוך קורס';
        editBtn.onclick = function () {
          location.href = "create-course.html?mode=edit&id=" + course.id;
        };

        /* כפתור מחיקה */
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "btn-delete";
        deleteBtn.innerHTML = '<i class="fas fa-trash"></i> מחק קורס';
        deleteBtn.onclick = function () {
          if (window.deleteCourseHandler) window.deleteCourseHandler();
        };

        controlsDiv.appendChild(editBtn);
        controlsDiv.appendChild(deleteBtn);
        controlsDiv.style.marginTop = "15px";
        controlsDiv.style.display = "flex";
        controlsDiv.style.gap = "10px";

        header.appendChild(controlsDiv);
      }
    }
  });
}

/* ================================================================
   חלק 12: AI Context Menu – הסבר/הרחבה של טקסט שנבחר
   ================================================================
   כאשר הסטודנט מסמן טקסט בעמוד – מופיע תפריט עם:
   - "הסבר לי" → Gemini מסביר את הטקסט בעברית פשוטה
   - "הרחב" → Gemini נותן מידע נוסף ודוגמאות
*/
import { getApiKey, saveApiKey, sendChatMessage } from "./ai-service.js";

document.addEventListener("DOMContentLoaded", () => {
  const aiContextMenu = document.getElementById("aiContextMenu");
  const aiBtnExplain = document.getElementById("aiBtnExplain");
  const aiBtnExpand = document.getElementById("aiBtnExpand");

  const aiResultModalOverlay = document.getElementById("aiResultModalOverlay");
  const aiModalCloseBtn = document.getElementById("aiModalCloseBtn");
  const aiModalLoading = document.getElementById("aiModalLoading");
  const aiModalContent = document.getElementById("aiModalContent");

  const studentAiSettings = document.getElementById("studentAiSettings");
  const studentApiKey = document.getElementById("studentApiKey");
  const saveStudentKeyBtn = document.getElementById("saveStudentKeyBtn");

  let currentSelectedText = "";

  /* --- זיהוי בחירת טקסט והצגת תפריט --- */
  document.addEventListener("mouseup", (e) => {
    /* התעלמות מלחיצה בתוך התפריט או המודל */
    if (
      e.target.closest("#aiContextMenu") ||
      e.target.closest("#aiResultModalOverlay")
    ) {
      return;
    }

    /* הצגת התפריט רק באזורים של טקסט קורס או שמות פרקים */
    if (!e.target.closest(".course-section") && !e.target.closest(".lesson-item") && !e.target.closest(".section-title") && !e.target.closest(".mod-title")) {
        aiContextMenu.style.display = "none";
        currentSelectedText = "";
        return;
    }

    const selection = window.getSelection();
    const text = selection.toString().trim();

    if (text.length > 0) {
      currentSelectedText = text;
      /* מיקום התפריט מעט מעל הסמן */
      const x = e.pageX;
      const y = e.pageY - 40;
      aiContextMenu.style.left = `${x}px`;
      aiContextMenu.style.top = `${y}px`;
      aiContextMenu.style.display = "flex";
    } else {
      aiContextMenu.style.display = "none";
      currentSelectedText = "";
    }
  });

  /* הסתרת תפריט בלחיצה מחוץ או בגלילה */
  document.addEventListener("mousedown", (e) => {
    if (!e.target.closest("#aiContextMenu")) {
      aiContextMenu.style.display = "none";
    }
  });

  window.addEventListener("scroll", () => {
    aiContextMenu.style.display = "none";
  });

  /**
   * triggerAiAction - שולח את הטקסט שנבחר ל-Gemini
   * @param {string} actionType - "explain" (הסבר) או "expand" (הרחבה)
   */
  async function triggerAiAction(actionType) {
    aiContextMenu.style.display = "none";
    const textToAnalyze = currentSelectedText;
    currentSelectedText = "";
    window.getSelection().removeAllRanges();

    /* בדיקת מפתח API */
    const currentKey = getApiKey();
    if (!currentKey) {
      studentAiSettings.style.display = "block";
    } else {
      studentAiSettings.style.display = "none";
    }

    aiModalContent.innerHTML = "";
    aiModalLoading.style.display = "block";
    aiResultModalOverlay.style.display = "flex";

    if (!currentKey) {
      aiModalLoading.style.display = "none";
      aiModalContent.innerHTML = `<p style="color:#d9534f;"><i class="fas fa-exclamation-triangle"></i> אנא הזן מפתח API למטה כדי לגשת לעוזר ה-AI.</p>`;
      return;
    }

    /* בניית prompt לפי סוג הפעולה */
    let prompt = "";
    if (actionType === "explain") {
      prompt = `הסבר לי את הטקסט הבא בצורה פשוטה, קלה להבנה ובעברית ברורה:\n\n"${textToAnalyze}"`;
    } else if (actionType === "expand") {
      prompt = `תן לי מידע נוסף, הקשר רחב יותר, או דוגמאות לטקסט הבא (בעברית):\n\n"${textToAnalyze}"`;
    }

    try {
      const msgs = [{ role: "user", content: prompt }];
      const response = await sendChatMessage(msgs);
      aiModalLoading.style.display = "none";
      aiModalContent.innerHTML = typeof marked !== 'undefined' ? marked.parse(response) : response.replace(/\n/g, "<br>");
    } catch (error) {
      aiModalLoading.style.display = "none";
      aiModalContent.innerHTML = `<p style="color:#d9534f;">שגיאה: ${error.message}</p>`;
      studentAiSettings.style.display = "block";
    }
  }

  /* מאזיני לחיצה על כפתורי ה-Context Menu */
  if (aiBtnExplain)
    aiBtnExplain.addEventListener("click", () => triggerAiAction("explain"));
  if (aiBtnExpand)
    aiBtnExpand.addEventListener("click", () => triggerAiAction("expand"));

  /* סגירת מודל התוצאה */
  if (aiModalCloseBtn) {
    aiModalCloseBtn.addEventListener("click", () => {
      aiResultModalOverlay.style.display = "none";
    });
  }

  /* שמירת מפתח API של הסטודנט */
  if (saveStudentKeyBtn && studentApiKey) {
    saveStudentKeyBtn.addEventListener("click", () => {
      const key = studentApiKey.value.trim();
      if (saveApiKey(key)) {
        studentAiSettings.style.display = "none";
        studentApiKey.value = "";
      }
    });
  }
});

/* ================================================================
   חלק 13: מחולל מבחן AI (Quiz)
   ================================================================
   כפתור "בחן את עצמי (AI)" מופיע בתחתית כל פרק.
   שולח את תוכן הפרק ל-Gemini, שמייצר מבחן רב-ברירה (JSON).
   מרנדר את המבחן במודל, ובסיום מציג ציון.
*/

/** נתוני המבחן הנוכחי */
let currentQuizData = [];
/** דגל למניעת רישום מאזינים כפול */
let quizHandlersAttached = false;

/**
 * renderQuizHTML - מרנדר את שאלות המבחן
 * @param {Array} quizArray - מערך שאלות מה-AI
 * @param {HTMLElement} container - אלמנט ה-DOM
 */
function renderQuizHTML(quizArray, container) {
  container.innerHTML = "";
  quizArray.forEach((q, qIndex) => {
    const qDiv = document.createElement("div");
    qDiv.className = "ai-quiz-question";

    const title = document.createElement("h4");
    title.innerText = `${qIndex + 1}. ${q.question}`;
    qDiv.appendChild(title);

    const optionsDiv = document.createElement("div");
    optionsDiv.className = "ai-quiz-options";

    q.options.forEach((optText, optIndex) => {
      const optLabel = document.createElement("label");
      optLabel.className = "ai-quiz-option";

      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = `quiz_q_${qIndex}`;
      radio.value = optIndex;

      optLabel.appendChild(radio);
      optLabel.appendChild(document.createTextNode(optText));
      optionsDiv.appendChild(optLabel);
    });

    qDiv.appendChild(optionsDiv);
    container.appendChild(qDiv);
  });
}

/**
 * attachQuizHandlers - מחבר מאזינים לכפתורי "בדוק" ו"סגור" (פעם אחת)
 */
function attachQuizHandlers() {
  if (quizHandlersAttached) return;
  quizHandlersAttached = true;

  const submitBtn = document.getElementById("aiQuizSubmitBtn");
  const closeBtn = document.getElementById("aiQuizCloseBtn");
  const overlay = document.getElementById("aiQuizModalOverlay");
  const scoreEl = document.getElementById("aiQuizScore");

  if (submitBtn) {
    submitBtn.addEventListener("click", () => {
      let correctCount = 0;
      currentQuizData.forEach((q, qIndex) => {
        const selected = document.querySelector(
          `input[name="quiz_q_${qIndex}"]:checked`,
        );
        const allRadios = document.querySelectorAll(
          `input[name="quiz_q_${qIndex}"]`,
        );

        /* ניקוי סימונים קודמים */
        allRadios.forEach((r) =>
          r.parentElement.classList.remove("correct", "incorrect"),
        );

        if (selected) {
          const val = parseInt(selected.value, 10);
          if (val === q.answerIndex) {
            correctCount++;
            selected.parentElement.classList.add("correct");
          } else {
            selected.parentElement.classList.add("incorrect");
            /* סימון התשובה הנכונה */
            const correct = document.querySelector(
              `input[name="quiz_q_${qIndex}"][value="${q.answerIndex}"]`,
            );
            if (correct) correct.parentElement.classList.add("correct");
          }
        } else {
          const correct = document.querySelector(
            `input[name="quiz_q_${qIndex}"][value="${q.answerIndex}"]`,
          );
          if (correct) correct.parentElement.classList.add("correct");
        }
      });

      /* הצגת ציון */
      if (scoreEl) {
        scoreEl.innerText = `ציון: ${correctCount} / ${currentQuizData.length}`;
        scoreEl.style.display = "block";
      }
      submitBtn.style.display = "none";
    });
  }

  if (closeBtn && overlay) {
    closeBtn.addEventListener("click", () => {
      overlay.style.display = "none";
    });
  }
}

/**
 * מאזין לכפתור "בחן את עצמי" (delegated event)
 * מזהה את הפרק, שולח את תוכנו ל-Gemini, ומציג מבחן במודל.
 */
document.addEventListener("click", async (e) => {
  const quizBtn = e.target.closest(".ai-quiz-trigger-btn");
  if (!quizBtn) return;

  const aiQuizModalOverlay = document.getElementById("aiQuizModalOverlay");
  const aiQuizLoading = document.getElementById("aiQuizLoading");
  const aiQuizContent = document.getElementById("aiQuizContent");
  const aiQuizScore = document.getElementById("aiQuizScore");
  const aiQuizSubmitBtn = document.getElementById("aiQuizSubmitBtn");

  if (!aiQuizModalOverlay) return;
  // Use module context since the structure changed to modules!
  if (!currentCourse || !currentCourse.modules || !currentCourse.modules[currentModuleIndex]) return;

  attachQuizHandlers();

  const secIndex = parseInt(quizBtn.getAttribute("data-section"), 10);
  const sectionInfo = currentCourse.modules[currentModuleIndex].sections[secIndex];
  if (!sectionInfo) return;

  const sourceText =
    sectionInfo.content || sectionInfo.description || sectionInfo.title;

  /* פתיחת המודל */
  aiQuizModalOverlay.style.display = "flex";
  aiQuizContent.innerHTML = "";
  aiQuizScore.style.display = "none";
  aiQuizSubmitBtn.style.display = "none";
  aiQuizLoading.style.display = "block";

  const currentKey = getApiKey();
  if (!currentKey) {
    aiQuizLoading.style.display = "none";
    aiQuizContent.innerHTML = `<p style="color:#d9534f; text-align:center;"><i class="fas fa-exclamation-triangle"></i> לפונקציה זו דרוש מפתח API. אנא הזן אותו בהגדרות (סמל הרובוט/גלגל שיניים).</p>`;
    return;
  }

  /* שליחה ל-Gemini – הוראה ליצירת JSON של שאלות */
  const messages = [
    {
      role: "system",
      content: `You are an educational AI. Generate a multiple-choice quiz based ONLY on the provided text.
You MUST respond with a valid JSON array of 3 to 5 objects.
Each object must have:
- "question" (string)
- "options" (array of 4 strings)
- "answerIndex" (integer 0-3 representing the correct option)
Do not provide any markdown, just the JSON array. Make the questions in Hebrew.`,
    },
    { role: "user", content: `Text: ${sourceText}` },
  ];

  try {
    const aiResponseText = await sendChatMessage(messages);
    const cleanContent = aiResponseText
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
    const quizData = JSON.parse(cleanContent);

    if (!Array.isArray(quizData) || quizData.length === 0) {
      throw new Error("פורמט שגוי התקבל מה-AI.");
    }

    currentQuizData = quizData;
    aiQuizLoading.style.display = "none";
    renderQuizHTML(currentQuizData, aiQuizContent);
    aiQuizSubmitBtn.style.display = "inline-block";
  } catch (err) {
    console.error("שגיאה במחולל המבחן:", err);
    aiQuizLoading.style.display = "none";
    aiQuizContent.innerHTML = `<p style="color:#d9534f; text-align:center;">שגיאה ביצירת המבחן. אנא נסה שוב מאוחר יותר.</p>`;
  }
});

/* ================================================================
   חלק 14: ניתוח סנטימנט של ביקורות (למרצה בלבד)
   ================================================================
   כפתור "ניתוח AI של ביקורות" מופיע רק למרצה.
   אוסף את כל הביקורות ושולח ל-Gemini לניתוח:
   - אחוזי סנטימנט (חיובי/שלילי/נייטרלי)
   - נקודות חוזק
   - אזורי שיפור
   - המלצות פרקטיות
*/
document.addEventListener("DOMContentLoaded", () => {
  const summarizeBtn = document.getElementById("aiSummarizeReviewsBtn");
  const sentimentOverlay = document.getElementById("aiSentimentModalOverlay");
  const sentimentCloseBtn = document.getElementById("aiSentimentCloseBtn");
  const sentimentLoading = document.getElementById("aiSentimentLoading");
  const sentimentContent = document.getElementById("aiSentimentContent");

  /**
   * checkAndShowSentimentBtn - מציג את כפתור הניתוח רק למרצה
   * משתמש ב-polling כי currentCourse נטען אסינכרונית
   */
  function checkAndShowSentimentBtn() {
    if (summarizeBtn && currentCourse && currentCourse.authorId) {
      onAuthStateChanged(window.auth, (user) => {
        if (user && currentCourse.authorId === user.uid) {
          summarizeBtn.style.display = "inline-flex";
        }
      });
    } else {
      setTimeout(checkAndShowSentimentBtn, 1000);
    }
  }
  checkAndShowSentimentBtn();

  if (summarizeBtn && sentimentOverlay) {
    summarizeBtn.addEventListener("click", async () => {
      const currentKey = getApiKey();
      if (!currentKey) {
        alert(
          "לפונקציה זו דרוש מפתח API. אנא הזן אותו בהגדרות (סמל הרובוט/גלגל שיניים בעמוד הקורס).",
        );
        return;
      }

      /* איסוף ביקורות מה-DOM */
      const reviewCards = document.querySelectorAll(".review-item");
      if (reviewCards.length === 0) {
        alert("אין ביקורות לנתח.");
        return;
      }

      const reviewTexts = [];
      reviewCards.forEach((card) => {
        const commentEl = card.querySelector(".review-text");
        const ratingEl = card.querySelector(".review-stars-display");
        const text = commentEl ? commentEl.innerText.trim() : "";
        const starsCount = ratingEl
          ? (ratingEl.innerText.match(/★/g) || []).length
          : 0;
        if (text) reviewTexts.push(`דירוג: ${starsCount}/5 - "${text}"`);
      });

      if (reviewTexts.length === 0) {
        alert("אין ביקורות טקסטואליות לנתח.");
        return;
      }

      /* פתיחת מודל */
      sentimentOverlay.style.display = "flex";
      sentimentContent.innerHTML = "";
      sentimentLoading.style.display = "block";

      try {
        const aggregatedReviews = reviewTexts.join("\n");
        const messages = [
          {
            role: "system",
            content: `You are an expert educational consultant. The user is a course instructor who has collected student reviews. Analyze the reviews and provide:
1. A brief overall sentiment summary (positive/neutral/negative percentage estimate).
2. Key strengths mentioned by students.
3. Key areas for improvement.
4. Actionable recommendations for the instructor.
Respond in Hebrew. Be concise and practical. Use bullet points.`,
          },
          {
            role: "user",
            content: `הנה ${reviewTexts.length} ביקורות מהקורס שלי:\n\n${aggregatedReviews}`,
          },
        ];

        const response = await sendChatMessage(messages);
        sentimentLoading.style.display = "none";
        sentimentContent.innerHTML = typeof marked !== 'undefined' ? marked.parse(response) : response.replace(/\n/g, "<br>");
      } catch (error) {
        sentimentLoading.style.display = "none";
        sentimentContent.innerHTML = `<p style="color:#d9534f;">שגיאה בניתוח: ${error.message}</p>`;
      }
    });

    if (sentimentCloseBtn) {
      sentimentCloseBtn.addEventListener("click", () => {
        sentimentOverlay.style.display = "none";
      });
    }
  }
});
