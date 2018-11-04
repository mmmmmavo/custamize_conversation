'use strict';
const {
  dialogflow,
  SignIn,
  BasicCard,
  Image
} = require('actions-on-google');
const app = dialogflow({
  debug: true,
  clientId: "187665952398-00pdbaeqqabgk5di7lb954ukkcm2qea5.apps.googleusercontent.com"
 });
const admin = require("firebase-admin");
const functions = require("firebase-functions");
var fs = require('fs');

var f = require('./secret.js');

admin.initializeApp({
  credential: admin.credential.cert(f.secret())
});

var db = admin.firestore()

const firestore = admin.firestore()
const settings = {/* your settings... */ timestampsInSnapshots: true};
firestore.settings(settings);
// admin.initializeApp(functions.config().firebase);
// const agent = new WebhookClient({ request, response });
const moment = require('moment-timezone');

async function isConversatinSet(UserIdFromGoogleHome){
  let userRef = await db.collection("users")
  let userDoc = await userRef.doc(UserIdFromGoogleHome).get().then(s => s.data())

  if(userDoc===undefined){
    // 初めて起動するユーザー
    await createUser(UserIdFromGoogleHome)
    return false
  }else if(userDoc["conversation"]!== undefined || userDoc["conversation"]!== null){
    // 会話がセットされているユーザー
    return true
  }else{
    // 会話がセットされていないユーザー
    return false
  }
}

async function fetchUserSpecifiedConvId(userId){
  let userRef = await db.collection("users")
  let user = await userRef.doc(userId).get().then(s => s.data())
  let ConvId = await user.conversation
  return ConvId
}

async function fetchConv(convId){
  let convRef = await db.collection("conversations")
  let conv = await convRef.doc(convId).get().then(s => s.data())
  return conv
}

async function createUser(UserIdFromGoogleHome){
  let userRef = await db.collection("users")
  let userDocRef = await userRef.doc(UserIdFromGoogleHome)
  await userDocRef.set({
    name: "デフォルトさん",
    conversation:null
  })
  return true
}

async function createConversation(conversationJson){
  let convRef = await db.collection("conversations")
  let docRef = await convRef.add(conversationJson)
  let createdConvId = await docRef.id
  return createdConvId
}

async function setConvOnUser(userId,convId){
  let userRef = await db.collection("users")
  let userDocRef = await userRef.doc(userId)
  await userDocRef.update({
    conversation:convId
  })
}

async function setEmailOnUser(userId,email){
  let userRef = await db.collection("users")
  let userDocRef = await userRef.doc(userId)
  await userDocRef.update({
    email:email
  })
}

app.intent('Default Welcome Intent', async conv => {
  console.log(conv.user.id)

  // if(conv.user.profile.payload === undefined){
  //   let speach = `webサイトと連携するために、`
  //   conv.close(new SignIn(speach));
  // }

  let convAlreadySetBool = await isConversatinSet(conv.user.id)
  console.log(JSON.stringify(conv.user.profile));
  // let convAlreadySetBool = await isConversatinSet(conv.user.storage.userId)

  if(convAlreadySetBool){

    let ConvIdUserSpecified = await fetchUserSpecifiedConvId(conv.user.id)
    let convConfig = await fetchConv(ConvIdUserSpecified)

    conv.data.config = {"conversation": convConfig}
    conv.data.config.counter = 0
    let speach = convConfig["welcome"]
    conv.contexts.set('prodSession', Number(convConfig.length), {});

    if(convConfig.length === 0){
      conv.close("<speak><prosody rate='slow'>" + speach + "</prosody></speak>");
    }else{
      conv.ask("<speak><prosody rate='slow'>" + speach + "</prosody></speak>");
    }


  }else{

    let speach = "このアプリでは、あなたが思った通りに会話をデザインできます。では、会話の設定を始めます。アプリの起動時に、私はなんと言えばいいですか？"
    conv.data.config = {
      "mode":"setting",
      "sectenceFieldToConfirm":"",
      "conversation":{
        "length":"0",
        "welcome":"",
        "1":""
      }
    }
    conv.contexts.set('welcomePromptConfig', 1, {});

    conv.ask(speach);

  }
});


app.intent('welcomePromptConfig-Intent', async conv => {
  console.log(conv.user.id)

  let welcomePromptToConfirm = conv.input.raw
  conv.data.config.conversation.welcome = welcomePromptToConfirm
  let speach = `起動時の私の発話は、${welcomePromptToConfirm}、で良いですか？`
  conv.contexts.set('welcomePromptConfirmation', 1, {});
  conv.ask(speach);
});

app.intent('welcomePromptConfirmation-yesIntent', async conv => {
  console.log(conv.user.id)

  let speach = `起動時の発話を設定しました。まだ会話を続けますか？`
  conv.contexts.set('confirmSessionContinue', 1, {});
  conv.ask(speach);
});

app.intent('welcomePromptConfirmation-noIntent', async conv => {
  let speach = `すみません。もう一度教えてください。アプリの起動時に、私はなんと言えばいいですか？`
  conv.contexts.set('welcomePromptConfig', 1, {});
  conv.ask(speach);
});

app.intent('confirmSessionContinue-yesIntent', async conv => {
  let speach = `では次の会話で私はなんと言えば良いですか？`
  conv.contexts.set('sessionSpeachConfig', 1, {});
  conv.ask(speach);
});

app.intent('confirmSessionContinue-noIntent', async conv => {
  console.log(conv.user.id)

  let coversationToCreate = conv.data.config
  coversationToCreate["conversation"]["user"] = conv.user.id
  let convId = await createConversation(coversationToCreate["conversation"])
  await setConvOnUser(conv.user.id,convId)
  const payload = conv.user.profile.payload;

  // await setConvOnUser(conv.user.storage.userId,convId)
  // サインイン済みだったら
  if(payload){
    let speach = `会話の設定が完了しました。次回起動時にそのようにお話しします。`
    const email = payload.email;
    await setEmailOnUser(conv.user.id,email)
    conv.close(speach);
  } else{
      let speach = `会話の設定が完了しました。次回起動時にそのようにお話しします。webサイトと連携するために、`
      conv.close(new SignIn(speach));
  }

});

app.intent('sessionSpeachConfig-Intent', async conv => {
  let sessionSpeachToConfirm = conv.input.raw
  let speach = `私は、${sessionSpeachToConfirm}、と言えば良いですか？`
  conv.data.config.sectenceFieldToConfirm = sessionSpeachToConfirm
  conv.contexts.set('sessionSpeachConfirmation', 1, {"text":sessionSpeachToConfirm});
  conv.ask(speach);
});

app.intent('sessionSpeachConfirmation-yesIntent', async conv => {
  let nowNum = Number(conv.data.config.conversation["length"]) + 1
  conv.data.config.conversation["length"] = String(nowNum)
  conv.data.config.conversation[String(nowNum)] = conv.data.config.sectenceFieldToConfirm
  conv.data.config.sectenceFieldToConfirm = ""
  let speach = `設定しました。${String(conv.data.config.conversation["length"])}回分の発話を設定しています。まだ会話を続けますか？`
  conv.contexts.set('confirmSessionContinue', 1, {});
  conv.ask(speach);
});

app.intent('sessionSpeachConfirmation-noIntent', async conv => {
  let speach = `すみません。もう一度教えてください。次の会話では、私はなんと言えばいいですか？`
  conv.contexts.set('sessionSpeachConfig', 1, {});
  conv.ask(speach);
});


app.intent('prodSession-Intent', async conv => {
  conv.data.config.counter += 1
  let speach = conv.data.config.conversation[String(conv.data.config.counter)]
  console.log(JSON.stringify(conv.data.config))
  if(String(conv.data.config.counter) === String(conv.data.config.conversation["length"])){
    conv.close(speach);
  }else{
    // conv.contexts.set('prodSession', 1, {});
    conv.ask(speach)
  }

});

app.intent('prodSession-configIntent', async conv => {
  conv.contexts.set('welcomePromptConfig', 1, {});

  conv.ask("会話の設定モードです。アプリの起動時に、私はなんと言えばいいですか？")
});

app.intent("getSignin-Intent", async (conv, params, signin) => {
  if (signin.status === "OK") {
    const payload = conv.user.profile.payload;
    const userId = payload.aud;
    const name = payload.name;
    const givenName = payload.given_name;
    const familyName = payload.family_name;
    const emailVerified = payload.email_verified;
    const picture = payload.picture;
    const email = payload.email;
    await setEmailOnUser(conv.user.id,email)
    // conv.ask(`${userId},${name},${givenName},${familyName},${email},${emailVerified},${picture}`)

    conv.ask("会話の設定が完了しました。googlehomeアプリに表示されたカードから、webページを見ることができます。");
  } else {
    conv.ask("パーソナライズするためには、サインインしてください。");
  }
});



exports.dialogflowFirebaseFulfillment = functions.https.onRequest(app);
