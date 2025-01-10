import fetch from 'node-fetch';
import fetchCookie from 'fetch-cookie';
import * as cheerio from 'cheerio';
import twilio from 'twilio';
import dotenv from 'dotenv';  
dotenv.config();  // טוען את משתני הסביבה

const fetchWithCookies = fetchCookie(fetch);
// הגדרת משתני סביבה
// const accountSid = "ACc3494a145fd0a86562e468252e16f7f3";
// const authToken = "5a205ae250fc580188125c324e6e7591";
const accountSid = process.env.ACCOUNT_SID;
const authToken = process.env.AUTH_TOKEN;
const client = twilio(accountSid, authToken);
const fromWhatsAppNumber = 'whatsapp:+14155238886'; // מספר ה-WhatsApp השולח (מספר Twilio)
const toWhatsAppNumbers = [
  'whatsapp:+972542161202',
  // 'whatsapp:+972542689591',
  // 'whatsapp:+972509026996',
  // 'whatsapp:+972585342355',
];

setInterval(checkNewExperiments, 1000 * 5); // 5 שניות

async function checkNewExperiments () {
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
        'ctl00$ContentPlaceHolder1$userid': '324118496', // הכנס את שם המשתמש שלך
        'ctl00$ContentPlaceHolder1$pw': 'Sk3Ckw86',      // הכנס את הסיסמה שלך
        // 'ctl00$ContentPlaceHolder1$userid': '324179746', // הכנס את שם המשתמש שלך
        // 'ctl00$ContentPlaceHolder1$pw': 'Or556589!',      // הכנס את הסיסמה שלך
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
      const message = "אין ניסויים"
      console.log(message);
      await sendWhatsAppMessage(message);

    }
    else {
      console.log('יש ניסויים');

      //   // שלב 4: חילוץ רשימת הניסויים
      //   const studies = [];
      //   $('tbody tr').each((index, element) => {
      //     const studyName = $(element).find('td').first().text().trim();
      //     if (studyName) {
      //       studies.push(studyName);
      //     }
      //   });

      //   if (studies.length > 0) {
      //     console.log('רשימת הניסויים:');
      //     studies.forEach((study, index) => {
      //       console.log(`${index + 1}. ${study}`);
      //     });
      //   } else {
      //     console.log('לא נמצאו ניסויים');
      //   }
    }

  } catch (error) {
    console.error('אירעה שגיאה:', error);
  }
};


// פונקציה לשליחת הודעת WhatsApp
async function sendWhatsAppMessage(message: string) {
  toWhatsAppNumbers.forEach(async (toWhatsAppNumber) => {
    try {
      const messageResponse = await client.messages.create({
        body: message,
        from: fromWhatsAppNumber,
        to: toWhatsAppNumber,
      });
      console.log('הודעת WhatsApp נשלחה בהצלחה:', messageResponse.sid);
    } catch (error) {
      console.error('שגיאה בשליחת הודעת WhatsApp:', error);
    }
  })
}