import expressHandlebarsSections from 'express-handlebars-sections';

const ms_per_sec = 1000;
const ms_per_min = ms_per_sec * 60;
const ms_per_hour = ms_per_min * 60;
const ms_per_day = ms_per_hour * 24;

function getDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return {year, month, day};
}

function getTime(date) {
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');

  return {hour, minute, second};
}

export default {
    section: expressHandlebarsSections(),
    format_number(price) { return new Intl.NumberFormat('en-US').format(price); },
    format_date(date) {
      if (!date) return '';
      const d = new Date(date);
      if (isNaN(d.getTime())) return '';

      const {year, month, day} = getDate(d);

      const {hour, minute, second} = getTime(d);

      return `${hour}:${minute}:${second} ${day}/${month}/${year}`;
    },
    format_only_date(date) {
      if (!date) return '';
      const d = new Date(date);
      if (isNaN(d.getTime())) return '';

      const {year, month, day} = getDate(d);

      return `${day}/${month}/${year}`;
    },
    format_only_time(time) {
      if (!time) return '';
      const d = new Date(time);
      if (isNaN(d.getTime())) return '';

      const {hour, minute, second} = getTime(d);

      return `${hour}:${minute}:${second}`;
    },
    format_date_input: function (date) {
        if (!date) return '';
        const d = new Date(date);
        if (isNaN(d.getTime())) return '';
        const {year, month, day} = getDate(d);
        return `${year}-${month}-${day}`;
    },
    format_time_remaining(date) {
      const now = new Date();
      const end = new Date(date);
      console.log(end);
      const diff = end - now;
      
      if (diff <= 0) return 'Auction Ended';
      
      const days = Math.floor(diff / ms_per_day);
      const hours = Math.floor((diff % ms_per_day) / ms_per_hour);
      const minutes = Math.floor((diff % ms_per_hour) / ms_per_min);
      const seconds = Math.floor((diff % ms_per_min) / ms_per_sec);
      
      // > 3 ngày: hiển thị ngày kết thúc
      if (days > 3) {
        if (isNaN(end.getTime())) return '';
        const {year, month, day} = getDate(d);
        const {hour, minute, second} = getTime(d);
        return `${hour}:${minute}:${second} ${day}/${month}/${year}`
      }
      
      // <= 3 ngày: hiển thị ... days left
      if (days >= 1) {
        return `${days} days left`;
      }
      
      // < 1 ngày: hiển thị ... hours left
      if (hours >= 1) {
        return `${hours} hours left`;
      }
      
      // < 1 giờ: hiển thị ... minutes left
      if (minutes >= 1) {
        return `${minutes} minutes left`;
      }
      
      // < 1 phút: hiển thị ... seconds left
      return `${seconds} seconds left`;
    },
    should_show_relative_time(date) {
      const now = new Date();
      const end = new Date(date);
      const diff = end - now;
      
      if (diff <= 0) return true; // Auction Ended counts as relative
      
      const days = Math.floor(diff / ms_per_day);
      return days <= 3; // True nếu <= 3 ngày (hiển thị relative time)
    },
    getPaginationRange(currentPage, totalPages) {
      const range = [];
      const maxVisible = 4;
      if (totalPages <= maxVisible) {
        for (let i = 1; i <= totalPages; i++) range.push({ number: i, type: 'number' });
      } else {
        range.push({ number: 1, type: 'number' });
        let start = Math.max(2, currentPage - 1);
        let end = Math.min(totalPages - 1, currentPage + 1);
        if (start > 2) range.push({ type: 'ellipsis' });
        for (let i = start; i <= end; i++) range.push({ number: i, type: 'number' });
        if (end < totalPages - 1) range.push({ type: 'ellipsis' });
        range.push({ number: totalPages, type: 'number' });
      }
      return range;
    },
    and(...args) { 
      return args.slice(0, -1).every(Boolean); 
    },
    or(...args) { 
      return args.slice(0, -1).some(Boolean); 
    },
    gt(a, b) { 
      return a > b; 
    },
    lt(a, b) { 
      return a < b; 
    },
    eq(a, b) { 
      return a === b; 
    },
    ne(a, b) {
      return a !== b;
    },
    add(a, b) { 
      return a + b; 
    },
    subtract(a, b) { 
      return a - b; 
    },
    multiply(a, b) {
      return a * b;
    },
    replace(str, search, replaceWith) {
      if (!str) return '';
      return str.replace(new RegExp(search, 'g'), replaceWith);
    },
    range(start, end) {
      const result = [];
      for (let i = start; i < end; i++) {
        result.push(i);
      }
      return result;
    },
    round(value, decimals) {
      const decimals_pow = Math.pow(10, decimals);
      return Math.round(value * decimals_pow) / decimals_pow;
    },
    length(arr) {
      return Array.isArray(arr) ? arr.length : 0;
    },
};