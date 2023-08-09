const axios = require('axios');
const { WebhookClient } = require('discord.js');
const cron = require('node-cron');
const dotenv = require('dotenv');

dotenv.config();

const webhookUrl = process.env.WEBHOOK_URL;

let previousArticleIds = [];
let lastFetchedDay = null;

const fetchArticleData = async (article) => {
  const articleUrl = `https://www.tabnews.com.br/api/v1/contents/NewsletterOficial/${encodeURIComponent(article.slug)}`;
  
  try {
    const articleResponse = await axios.get(articleUrl);

    if (articleResponse.status === 200) {
      return articleResponse.data.body;
    } else {
      console.error(`Failed to fetch article data: ${article.slug}`);
      return null;
    }
  } catch (error) {
    console.error(`An error occurred while fetching article: ${article.slug}`);
    console.error(`Error details:`, error.message);
    return null;
  }
};

const postToWebhook = async (article) => {
  const articleBody = await fetchArticleData(article);

  if (articleBody !== null) {
    const webhookClient = new WebhookClient({ url: webhookUrl });

    await webhookClient.send({
      embeds: [{
        title: article.title,
        description: articleBody,
        // fields: [
        //   { name: 'Content', value: articleBody },
        // ],
        url: article.source_url,
      }],      
    });

    console.log(`New article posted: ${article.title}`);
    previousArticleIds.push(article.id);
  }
};

const fetchAPIAndPostToWebhook = async () => {
  try {
    const response = await axios.get('https://www.tabnews.com.br/api/v1/contents/NewsletterOficial/');

    if (response.status === 200) {
      const currentDay = new Date().toISOString().split('T')[0];

      if (currentDay !== lastFetchedDay) {
        // Reset previousArticleIds array if a new day has started
        previousArticleIds = [];
        lastFetchedDay = currentDay;
      }

      const articles = response.data.filter(article => article.published_at.startsWith(currentDay));
      const newArticles = articles.filter(article => !previousArticleIds.includes(article.id));

      if (newArticles.length > 0) {
        for (const article of newArticles) {
          await postToWebhook(article);
        }
      } else {
        console.log('No new articles for this fetch.');
      }
    } else {
      console.error('Failed to fetch data from API.');
    }
  } catch (error) {
    console.error('An error occurred:', error.message);
  }
};

// Schedule the observer to run every minute (adjust as needed)
cron.schedule('* * * *', fetchAPIAndPostToWebhook);
console.log('Observer started.');
