'use strict';
const { dialogflow } = require('actions-on-google');
const app = dialogflow({ debug: true });
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

app.intent('Default Welcome Intent', async conv => {

  // ユーザーがdbになかったら登録もする
  let convAlreadySetBool = await isConversatinSet(conv.user.id)

  if(convAlreadySetBool){

    let ConvIdUserSpecified = await fetchUserSpecifiedConvId(conv.user.id)
    let convConfig = await fetchConv(ConvIdUserSpecified)

    console.log(convConfig);

    conv.data.config = convConfig
    conv.data.config.counter = 0
    let speach = convConfig.welcome
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
  let welcomePromptToConfirm = conv.input.raw
  conv.data.config.conversation.welcome = welcomePromptToConfirm
  let speach = `起動時の私の発話は、${welcomePromptToConfirm}で良いですか？`
  conv.contexts.set('welcomePromptConfirmation', 1, {});
  conv.ask(speach);
});

app.intent('welcomePromptConfirmation-yesIntent', async conv => {
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
  let coversationToCreate = conv.data.config
  coversationToCreate["conversation"]["user"] = conv.user.id
  let convId = await createConversation(coversationToCreate["conversation"])
  await setConvOnUser(conv.user.id,convId)

  let speach = `会話の設定が完了しました。次回起動時に仰せの通りにお話しします。`
  conv.close(speach);
});

app.intent('sessionSpeachConfig-Intent', async conv => {
  let sessionSpeachToConfirm = conv.input.raw
  let speach = `私は${sessionSpeachToConfirm}と言えば良いですか？`
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



exports.dialogflowFirebaseFulfillment = functions.https.onRequest(app);
