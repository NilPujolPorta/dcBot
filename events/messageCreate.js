const { Events } = require('discord.js');
const path = require('path');
const process = require('process');
const { authenticate } = require('@google-cloud/local-auth');
const { GoogleAuth } = require('google-auth-library');
const { google } = require('googleapis');
const fs = require('fs').promises;
const DB = require('../DB/database.json');
const { saveToDatabase } = require('../DB/utils');
// If modifying these scopes, delete token.json.
const SCOPES = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/documents'
];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

module.exports = {
    name: 'messageCreate',
    async execute(interaction) {
        //crear carpeta arrel si no existeix
        if (DB.carpetes.find(carpeta => carpeta.idDC == "root") == undefined) {
            let idCarpeta = await createFolder("LogsDiscord").catch(console.error);
            DB.carpetes.push({ "nom": "LogsDiscord", "id": idCarpeta, "idDC": "root" });
            saveToDatabase(DB)
        }
        let carpetaBase = DB.carpetes.find(carpeta => carpeta.idDC == "root").id;
        //crear carpeta server si no existeix
        if (DB.carpetes.find(carpeta => carpeta.idDC == interaction.guild.id) == undefined) {
            let idCarpeta = await createSubFolder(interaction.guild.name, carpetaBase).catch(console.error);
            DB.carpetes.push({ "nom": interaction.guild.name, "id": idCarpeta, "idDC": interaction.guild.id });
            saveToDatabase(DB)
        }
        let carpetaServer = DB.carpetes.find(carpeta => carpeta.idDC == interaction.guild.id).id;
        //crear carpeta canal si no existeix
        if (DB.carpetes.find(carpeta => carpeta.idDC == interaction.channel.id) == undefined) {
            let idCarpeta = await createSubFolder(interaction.channel.name, carpetaServer).catch(console.error);
            DB.carpetes.push({ "nom": interaction.channel.name, "id": idCarpeta, "idDC": interaction.channel.id });
            saveToDatabase(DB)
        }
        let carpetaCanalID = DB.carpetes.find(carpeta => carpeta.idDC == interaction.channel.id).id;
        //crear fitxer si no existeix i escriure-hi
        if (DB.fitxers.find(file => file.parent == carpetaCanalID && file.nom == new Date().toISOString().slice(0, 10).toString()) == undefined) {
            let idFitxer = await createDoc(carpetaCanalID).catch(console.error);
            DB.fitxers.push({ "nom": new Date().toISOString().slice(0, 10), "id": idFitxer, "parent": carpetaCanalID });
            saveToDatabase(DB)
            await updateDoc(idFitxer, interaction.author.username + ": " + interaction.content + "\n").catch(console.error);
        } else {
            let idFitxer = DB.fitxers.find(file => file.parent == carpetaCanalID && file.nom == new Date().toISOString().slice(0, 10)).id;
            await updateDoc(idFitxer, interaction.author.username + ": " + interaction.content + "\n").catch(console.error);
        }
    },

};


/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
    try {
        const content = await fs.readFile(TOKEN_PATH);
        const credentials = JSON.parse(content);
        return google.auth.fromJSON(credentials);
    } catch (err) {
        return null;
    }
}

/**
 * Serializes credentials to a file comptible with GoogleAUth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
    const content = await fs.readFile(CREDENTIALS_PATH);
    const keys = JSON.parse(content);
    const key = keys.installed || keys.web;
    const payload = JSON.stringify({
        type: 'authorized_user',
        client_id: key.client_id,
        client_secret: key.client_secret,
        refresh_token: client.credentials.refresh_token,
    });
    await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
    let client = await loadSavedCredentialsIfExist();
    if (client) {
        return client;
    }
    client = await authenticate({
        scopes: SCOPES,
        keyfilePath: CREDENTIALS_PATH,
    });
    if (client.credentials) {
        await saveCredentials(client);
    }
    return client;
}


async function createFolder(nom) {
    let authClient = await authorize();
    const drive = google.drive({ version: 'v3', auth: authClient });
    const fileMetadata = {
        name: nom,
        mimeType: 'application/vnd.google-apps.folder',
    };
    const res = await drive.files.create({
        resource: fileMetadata,
        fields: 'id',
    });
    return res.data.id;
}

async function createSubFolder(nom, parent) {
    let authClient = await authorize();
    const drive = google.drive({ version: 'v3', auth: authClient });
    const fileMetadata = {
        name: nom,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parent]
    };
    const res = await drive.files.create({
        resource: fileMetadata,
        fields: 'id',
    });
    return res.data.id;
}

async function createDoc(carpeta) {
    let authClient = await authorize();
    const drive = google.drive({ version: 'v3', auth: authClient });
    const fileMetadata = {
        name: new Date().toISOString().slice(0, 10).toString(),
        parents: [carpeta],
        mimeType: 'application/vnd.google-apps.document',
    };
    const res = await drive.files.create({
        requestBody: fileMetadata,
        fields: 'id',
    }
    );
    return res.data.id;
}



async function updateDoc(docId, text) {
    let auth = await authorize();
    const docs = google.docs({ version: 'v1', auth });
    await docs.documents.batchUpdate({
        documentId: docId,
        requestBody: {
            requests: [
                {
                    insertText: {
                        endOfSegmentLocation: {},
                        text: text
                    }
                }]
        }
    });
}