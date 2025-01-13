import fetch from 'node-fetch';
import fetchCookie from 'fetch-cookie';
import * as cheerio from 'cheerio';
import twilio from 'twilio';
import dotenv from 'dotenv';

dotenv.config();  // טוען את משתני הסביבה

const fetchWithCookies = fetchCookie(fetch);

const accountSid = process.env.ACCOUNT_SID;
const authToken = process.env.AUTH_TOKEN;
const client = twilio(accountSid, authToken);
const fromWhatsAppNumber = 'whatsapp:+14155238886'; // מספר ה-WhatsApp השולח (מספר Twilio)

const defaultSonaLoginInfo = { userId: "324179746", password: "Or556589!" };

const studentsInfo = [
  { name: "יעל", whatsappPhoneNumber: 'whatsapp:+972542161202', sonaLoginInfo: { userId: "324118496", password: "Sk3Ckw86" }, myExperimentsList: [] },
  { name: "שחר", whatsappPhoneNumber: 'whatsapp:+972542689591', sonaLoginInfo: defaultSonaLoginInfo, myExperimentsList: [] },
  { name: "אורי", whatsappPhoneNumber: 'whatsapp:+972509026996', sonaLoginInfo: { userId: "324179746", password: "Or556589!" }, myExperimentsList: [] },
  { name: "אופק", whatsappPhoneNumber: 'whatsapp:+972585342355', sonaLoginInfo: defaultSonaLoginInfo, myExperimentsList: [] },
]


setInterval(fetchExperimentsForEveryone, 1000 * 15); // 30 seconds

function fetchExperimentsForEveryone() {

  // ביצוע הבדיקות עבור כל סטודנט בנפרד
  studentsInfo.reduce(async (promise, student) => {
    const canGetMessages = await doesUserCanGetMessages(student.whatsappPhoneNumber, student.name);
    await promise; // מחכים לסיום הפעולה הקודמת

    if (canGetMessages) {
      console.log("\n ניתן לשלוח הודעות ל", student.name, "ולכן עוברים לבדיקת ניסויים חדשים \n");
      await promise; // מחכים לסיום הפעולה הקודמת
      return checkNewExperiments(student);
    }
    else {
      console.log("\n לא ניתן לשלוח הודעות ל", student.name, "ולכן לא עברנו לשלב בדיקת ניסויים חדשים \n");
    }
  }, Promise.resolve());
}


async function checkNewExperiments(student: { name: string; whatsappPhoneNumber: string, sonaLoginInfo: { userId: string, password: string, }, myExperimentsList: { experimentName: string, experimentId: string }[] }) {
  const response = await fetchWithCookies('https://bgupsyc.sona-systems.com/default.aspx?logout=Y', {
    method: 'GET',
  });

  if (!response.ok) {
    console.error('שגיאה בשליפת דף ההתחברות:', response.statusText);
    return;
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const viewState = $('#__VIEWSTATE').val();
  const eventValidation = $('#__EVENTVALIDATION').val();

  if (!viewState || !eventValidation) {
    console.error('לא נמצאו הערכים הדרושים.');
    return;
  }

  try {
    // שלב 1: התחברות לאתר
    const loginResponse = await fetchWithCookies('https://bgupsyc.sona-systems.com/default.aspx?logout=Y', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'ctl00$ContentPlaceHolder1$userid': student.sonaLoginInfo.userId, // הכנס את שם המשתמש שלך
        'ctl00$ContentPlaceHolder1$pw': student.sonaLoginInfo.password,      // הכנס את הסיסמה שלך
        '__VIEWSTATE': String(viewState ?? ''), // המרת viewState למחרוזת
        '__EVENTVALIDATION': String(eventValidation ?? ''), // המרת eventValidation למחרוזת
        'ctl00$ContentPlaceHolder1$default_auth_button': 'Log In',
      }).toString(),
    });

    if (!loginResponse.ok) {
      console.error('שגיאה בהתחברות:', loginResponse.statusText);
      return;
    }

    // שלב 2: גישה לדף מוגן לאחר התחברות
    const protectedPageResponse = await fetchWithCookies('https://bgupsyc.sona-systems.com/all_exp_participant.aspx', {
      method: 'GET',
    });

    if (!protectedPageResponse.ok) {
      console.error('שגיאה בגישה לדף המוגן:', protectedPageResponse.statusText);
      return;
    }

    const protectedPageHtml = await protectedPageResponse.text();

    // שלב 3: ניתוח התוכן באמצעות Cheerio
    const $ = cheerio.load(protectedPageHtml);
    const noStudiesMessage = $('#ctl00_ContentPlaceHolder1_lblNoStudies').text().trim();
    if (noStudiesMessage === 'No studies are available at this time.') {
      const message = "לא נמצאו ניסויים עבור"
      // רישום עבורי בלוגים
      console.log("\n", message, student.name, "\n");
    }

    else {
      const myCurrentExperiments: { experimentName: string, experimentId: string }[] = [];
      $('tr[id^="ctl00_ContentPlaceHolder1_repStudentStudies_"]').each((index, element) => {
        const experimentName = $(element).find('a[id$="HyperlinkStudentStudyInfo"]').text().trim();
        const href = $(element).find('a[id$="HyperlinkStudentStudyInfo"]').attr('href');
        const experimentId = href ? new URLSearchParams(href.split('?')[1]).get('experiment_id') : null;

        if (experimentName && experimentId) {
          myCurrentExperiments.push({
            experimentName,
            experimentId,
          });
        }
      });

      const ExperimentsToInformAbout = myCurrentExperiments.filter(
        (currentExperiment) =>
          !student.myExperimentsList.some(
            (studentExperiment) =>
              studentExperiment.experimentId === currentExperiment.experimentId
          )
      );

      if (ExperimentsToInformAbout.length > 0) {

        student.myExperimentsList = myCurrentExperiments;

        const experimentNamesString = ExperimentsToInformAbout
          .map(experiment => "• " + experiment.experimentName)
          .join('\n ');

        const messageSingleOrPlural = ExperimentsToInformAbout.length === 1 ? "נמצא עבורך הניסוי הבא:" : "נמצאו עבורך הניסויים הבאים:";
        const message = `היי ${student.name}, ${messageSingleOrPlural} \n ${experimentNamesString}`;

        // רישום עבורי בלוגים
        console.log("\n", ExperimentsToInformAbout.length === 1 ? "הניסוי הבא נשלח ל" : "הניסויים הבאים נשלחו ל", student.name, ":\n", ExperimentsToInformAbout, "\n")

        await sendWhatsAppMessage(student.name, student.whatsappPhoneNumber, message);
      }
      else {
        // רישום עבורי בלוגים
        console.log("\n נמצאו ניסויים עבור", student.name, "אך הם אינם ניסויים חדשים ולכן לא נשלחה הודעה \n")
      }
    }

    // logout
    await fetchWithCookies('https://bgupsyc.sona-systems.com/default.aspx?logout=Y', {
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'he,en-US;q=0.9,en;q=0.8,fr;q=0.7,da;q=0.6',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
        'Cookie': 'language_pref=EN; ARRAffinity=21a5192a74952511370c7b42f1bc64db6b7a8e31226970bf5b21e0d8505907e7; ARRAffinitySameSite=21a5192a74952511370c7b42f1bc64db6b7a8e31226970bf5b21e0d8505907e7; ASP.NET_SessionId=nht1vggeoawm0tsborcx1ufp; cookie_ck=Y; cookieconsent_status=dismiss; WEBHOME=B3A5B5C7B9A6AC54C0D487F385D91BBFAC74730AC72DDCAACCD6F12159C58E1E9B09210E4A1DD0FAD8AC4EBCA0A7BBB40DB074B10C8302877D15664B152F414999E2946586278D818F43926EF7089EE79634250CDA09B1C33567EC7DA15016D1',
        'Referer': 'https://bgupsyc.sona-systems.com/all_exp_participant.aspx',
        'Sec-CH-UA': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        'Sec-CH-UA-Mobile': '?1',
        'Sec-CH-UA-Platform': '"Android"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      },
    });

  } catch (error) {
    console.error('אירעה שגיאה:', error);
  }
};


// פונקציה לשליחת הודעת WhatsApp
async function sendWhatsAppMessage(name: string, whatsappPhoneNumber: string, message: string) {
  try {
    const messageResponse = await client.messages.create({
      body: message,
      from: fromWhatsAppNumber,
      to: whatsappPhoneNumber,
    });
    console.log('\n ל', name, 'WhatsApp נשלחה בהצלחה הודעת: \n', message, '\n מזהה הודעה: ', messageResponse.sid, "\n");
  } catch (error) {
    console.error('שגיאה בשליחת הודעת WhatsApp:', error);
  }
}


async function doesUserCanGetMessages(whatsappPhoneNumber: string, studentName: string) {
  const now = new Date();
  try {
    const messages = await client.messages.list({
      to: fromWhatsAppNumber,
      from: whatsappPhoneNumber,
      limit: 1, // חיפוש רק בהודעה האחרונה
    });

    // אם התקבלה הודעה ב-24 השעות האחרונות- תחזיר לי true
    if (messages.length > 0) {
      const lastMessageTime = new Date(messages[0].dateSent); // הזמן שההודעה נשלחה
      const timeDifferenceInMs = now.getTime() - lastMessageTime.getTime();
      const timeDifferenceInHours = timeDifferenceInMs / (1000 * 60 * 60);
      if (timeDifferenceInHours < 24) {
        if (timeDifferenceInHours > 23.9 && timeDifferenceInHours < 23.9167) { // עברו יותר מ 23:54 דקות ופחות מ 23:55 דקות מהפעם האחרונה שהתקבלה הודעה
          await sendWhatsAppMessage(studentName, whatsappPhoneNumber, `היי ${studentName}, יש לשלוח הודעה על מנת להמשיך לאפשר לבוט לעדכן אותך בניסויים חדשים ב-24 השעות הקרובות. תוכן ההודעה שתשלח אינו משנה`);
        }
        return true
      }
      else return false;
    } else {
      console.log('לא התקבלו הודעות מהמספר הזה.');
      return false;
    }
  } catch (error) {
    console.error('שגיאה בשליפת הודעות:', error);
    return false;
  }
}