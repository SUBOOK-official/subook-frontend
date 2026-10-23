import { By,until } from 'selenium-webdriver';

export class Page {
  constructor(driver,origin){this.driver=driver;this.origin=origin;}
  async open(path){await this.driver.get(this.origin+path);}
  async element(css){return this.driver.wait(async()=>{for(const e of await this.driver.findElements(By.css(css)))if(await e.isDisplayed())return e;return false;},15000,`표시 요소 없음: ${css}`);}
  async text(css){return (await this.element(css)).getText();}
  async click(css){const e=await this.element(css);await this.driver.executeScript('arguments[0].scrollIntoView({block:"center",behavior:"instant"})',e);await this.driver.wait(until.elementIsEnabled(e),10000);await e.click();}
  async path(path,timeout=20000){await this.driver.wait(async()=>new URL(await this.driver.getCurrentUrl()).pathname===path,timeout,`이동 실패: ${path}`);}
}
export class ProductPage extends Page {
  async showOptions(){await this.click('.product-options__trigger');}
  async option(label){await this.showOptions();const e=await this.driver.wait(until.elementLocated(By.xpath(`//*[@role='option' and normalize-space(.)='${label}']`)),15000);await this.driver.wait(until.elementIsVisible(e),15000);await e.click();}
  async addToCart(){const button=await this.driver.findElement(By.xpath("//button[normalize-space(.)='장바구니 담기']"));await this.driver.executeScript('arguments[0].scrollIntoView({block:"center",behavior:"instant"})',button);await button.click();await this.driver.wait(async()=>(await this.driver.findElement(By.css('body')).getText()).includes('장바구니에'),10000);}
}
export class OrderPage extends Page {
  async amount(label){const row=await this.driver.findElement(By.xpath(`//*[contains(@class,'order-sidebar__row')][span[normalize-space(.)='${label}']]`));return (await row.findElements(By.css('span'))).at(-1).getText();}
}
export class B2bPage extends Page {
  async fill(){for(const [name,value] of Object.entries({organization:'QA 학원',contactName:'QA 담당자',phone:'01000000001',quantity:'30'}))await (await this.element(`[name="${name}"]`)).sendKeys(value);}
}
