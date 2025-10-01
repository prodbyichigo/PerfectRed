const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

async function createUser(username, password) {
    const privateDir = path.join(__dirname, 'private');
    const usersFile = path.join(privateDir, 'users.json');

    if (!fs.existsSync(privateDir)) {
        fs.mkdirSync(privateDir);
    }

    let users = [];
    if (fs.existsSync(usersFile)) {
        const data = fs.readFileSync(usersFile, 'utf-8').trim();
        if (data) {
            try {
                users = JSON.parse(data);
                console.log("Loaded existing users:", users);
            } catch (err) {
                console.error("Error parsing users.json, starting fresh:", err);
                users = [];
            }
        }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    users.push({ username, password: hashedPassword });

    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
    console.log(`User "${username}" created successfully!`);
}

createUser('admin', 'yourpassword');
